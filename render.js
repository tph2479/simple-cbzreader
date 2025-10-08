const { ipcRenderer, webUtils } = require("electron");

const container = document.getElementById("container");
const pageCounter = document.getElementById("page-counter");
const progressFill = document.getElementById("progress-fill");
const fileNameElement = document.getElementById('file-name');
const navBar = document.getElementById('nav-bar');


let filePath;
let totalPages;
let currentPage;
let loadedPages;
const WINDOW_SIZE = 10;

// Track all created URLs for cleanup
const activeUrls = new Set();

// Track scroll/resize listeners for cleanup
let scrollHandler, resizeHandler;

// Clear container
function clearImages() {
  // Revoke all active URLs
  for (const url of activeUrls) {
    URL.revokeObjectURL(url);
  }
  activeUrls.clear();

  // Clear DOM
  container.innerHTML = "";
  loadedPages = new Map();
  currentPage = 0;
  totalPages = 0;
  document.title = "CBZ Reader";
  fileNameElement.textContent = 'Press O or drag cbz, avif, jpg, png, gif file to this windows to view';
  navBar.classList.remove('has-file');
  pageCounter.textContent = "0/0";
}

clearImages();

function createTrackedURL(blob) {
  const url = URL.createObjectURL(blob);
  activeUrls.add(url);
  return url;
}

function revokeTrackedURL(url) {
  if (activeUrls.has(url)) {
    URL.revokeObjectURL(url);
    activeUrls.delete(url);
  }
}

function addImage(image) {
  if (loadedPages.has(image.pageNumber)) {
    return;
  }

  const blob = new Blob([image.buffer], { type: `image/${image.ext}` });
  const url = createTrackedURL(blob);

  const img = document.createElement("img");
  img.src = url;
  img.dataset.pageIndex = image.pageNumber.toString();

  const cleanup = () => {
    try {
      revokeTrackedURL(url);
    } catch (err) {
      console.warn('Error revoking URL:', err);
    }
  };

  img.onload = cleanup;
  img.onerror = cleanup;

  setTimeout(() => {
    if (activeUrls.has(url)) {
      console.warn('URL not revoked after 30s, force cleanup:', url);
      revokeTrackedURL(url);
    }
  }, 10000);

  try {
    let inserted = false;
    for (const child of container.children) {
      const childPageIndex = parseInt(child.dataset.pageIndex, 10);
      if (isNaN(childPageIndex)) {
        console.warn('Invalid pageIndex detected:', child.dataset.pageIndex);
        continue;
      }

      if (image.pageNumber < childPageIndex) {
        container.insertBefore(img, child);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      container.appendChild(img);
    }

    loadedPages.set(image.pageNumber, img);

  } catch (error) {
    console.error('Error adding image to DOM:', error);
    cleanup();
  }
}

function updatePage() {
  try {
    const imgElements = container.querySelectorAll("img");
    const viewportHeight = window.innerHeight;
    let visiblePage = currentPage;

    for (let i = 0; i < imgElements.length; i++) {
      const rect = imgElements[i].getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
      if (visibleHeight / viewportHeight > 0.5) {
        const pageIndex = parseInt(imgElements[i].dataset.pageIndex, 10);
        if (!isNaN(pageIndex)) {
          visiblePage = pageIndex;
          break;
        }
      }
    }

    currentPage = visiblePage;

    if (pageCounter) {
      pageCounter.textContent = `${currentPage + 1}/${totalPages}`;
    }
    if (progressFill) {
      progressFill.style.width = `${((currentPage + 1) / totalPages) * 100}%`;
    }

    ensurePages();
  } catch (error) {
    console.error('Error in updatePage:', error);
  }
}

// Lazy load logic
function ensurePages() {
  if (!filePath) return;

  try {
    const min = Math.max(0, currentPage - Math.floor(WINDOW_SIZE / 2));
    const max = Math.min(totalPages - 1, currentPage + Math.floor(WINDOW_SIZE / 2));

    for (let i = min; i <= max; i++) {
      if (!loadedPages.has(i)) {
        ipcRenderer.send("request-page", { filePath, index: i });
      }
    }

    const toDelete = [];
    for (const [idx, el] of loadedPages) {
      if (idx < min || idx > max) {
        toDelete.push({ idx, el });
      }
    }

    for (const { idx, el } of toDelete) {
      try {
        if (el.parentNode) {
          container.removeChild(el);
        }
        loadedPages.delete(idx);
      } catch (error) {
        console.warn('Error removing element:', error);
        loadedPages.delete(idx); // Still delete from map
      }
    }
  } catch (error) {
    console.error('Error in ensurePages:', error);
  }
}

// Setup event listeners with cleanup tracking
function setupEventListeners() {
  // Remove old listeners if they exist
  if (scrollHandler) {
    window.removeEventListener("scroll", scrollHandler);
  }
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
  }

  // Create new handlers
  scrollHandler = updatePage;
  resizeHandler = updatePage;

  // Add listeners
  window.addEventListener("scroll", scrollHandler, { passive: true });
  window.addEventListener("resize", resizeHandler);
}

// Cleanup function
function cleanup() {
  clearImages();

  if (scrollHandler) {
    window.removeEventListener("scroll", scrollHandler);
    scrollHandler = null;
  }
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }

  // Remove IPC listeners
  ipcRenderer.removeAllListeners("show-images");
  ipcRenderer.removeAllListeners("page-loaded");
}

ipcRenderer.on("show-images", (e, file) => {
  clearImages();

  filePath = file.filePath;
  totalPages = file.total;

  document.title = filePath;
  navBar.classList.add('has-file');
  fileNameElement.textContent = filePath.split(/[/\\]/).pop().split('.')[0];

  for (let i = 0; i < Math.min(WINDOW_SIZE, totalPages); i++) {
    ipcRenderer.send("request-page", { filePath, index: i });
  }
});

ipcRenderer.on("page-loaded", (e, image) => {
  addImage(image);
  updatePage();
});

// Setup event listeners
setupEventListeners();

// Drag & drop file
window.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); });
window.addEventListener("drop", e => {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer.files.length) {
    const file = e.dataTransfer.files[0];
    const fullPath = webUtils.getPathForFile(file);

    if (file.name.endsWith(".cbz")) {
      ipcRenderer.send("open-cbz", fullPath);
    } 

    else if (/\.(jpe?g|png|gif|webp|avif)$/i.test(file.name)) {
      ipcRenderer.send("open-image", fullPath);
    } else {
      console.log("Unsupported file type:", file.name);
    }
  }
});

// Cleanup on page unload
window.addEventListener("beforeunload", cleanup);
window.addEventListener("unload", cleanup);

ipcRenderer.send("renderer-ready");