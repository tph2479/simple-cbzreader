const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
const path = require("path");
const yauzl = require("yauzl");
const fs = require("fs");
const { execSync } = require('child_process');

function registerFileAssociation() {
    try {
        const exePath = process.execPath.replace(/\\/g, '\\\\');

        const regContent = `Windows Registry Editor Version 5.00\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\.cbz]\r\n` +
            `@="cbzfile"\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\.cbz\\OpenWithProgids]\r\n` +
            `"cbzfile"=""\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\cbzfile]\r\n` +
            `@="CBZ Archive"\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\cbzfile\\shell]\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\cbzfile\\shell\\open]\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\cbzfile\\shell\\open\\command]\r\n` +
            `@="\\"${exePath}\\" \\"%1\\""\r\n` +
            `[HKEY_CLASSES_ROOT\\.avif]\r\n` +
            `@="aviffile"\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\.avif\\OpenWithProgids]\r\n` +
            `"aviffile"=""\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\aviffile]\r\n` +
            `@="AVIF Image"\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\aviffile\\shell]\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\aviffile\\shell\\open]\r\n\r\n` +
            `[HKEY_CLASSES_ROOT\\aviffile\\shell\\open\\command]\r\n` +
            `@="\\"${exePath}\\" \\"%1\\""\r\n`;

        // Save to current directory instead of temp
        const regFile = join(dirname(process.execPath), 'register.reg');
        writeFileSync(regFile, regContent, 'utf8');

        // Run registry file
        execSync(`reg import "${regFile}"`, { stdio: 'inherit' });

        // Clean up
        unlinkSync(regFile);
    } catch (error) {
        console.error('Failed to register file association:', error.message);
        console.log('Please run as Administrator or use manual registry file.');
    }
}

function unregisterFileAssociation() {
    try {
        const regContent = `Windows Registry Editor Version 5.00\r\n\r\n` +
            `[-HKEY_CLASSES_ROOT\\cbzfile]\r\n` +
            `[-HKEY_CLASSES_ROOT\\aviffile]\r\n` +
            `[-HKEY_CLASSES_ROOT\\.avif]\r\n`;

        const regFile = join(dirname(process.execPath), 'unregister.reg');
        writeFileSync(regFile, regContent, 'utf8');

        execSync(`reg import "${regFile}"`, { stdio: 'inherit' });

        unlinkSync(regFile);
    } catch (error) {
        console.error('Failed to unregister:', error.message);
    }
}

let mainWindow;
let imageEntries;
let pending;
let rendererReady = false;

app.on("ready", () => {
    const args = process.argv.slice(1);
    if (args.includes('register') || args.includes('--register')) {
        registerFileAssociation();
        app.quit();
        process.exit(0);
    }

    if (args.includes('unregister') || args.includes('--unregister')) {
        unregisterFileAssociation();
        app.quit();
        process.exit(0);
    }

    const cbzPath = args.find(a => a.endsWith(".cbz"));
    const imagePath = args.find(a => /\.(jpe?g|png|gif|webp|avif)$/i.test(a));

    mainWindow = new BrowserWindow({
        width: 800, height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile("index.html");
    // mainWindow.setMenu(null);
    mainWindow.webContents.insertCSS(`
        body::-webkit-scrollbar { display: none; }
    `);

    const ret = globalShortcut.register('q', () => {
        app.quit();
    });

    if (cbzPath) {
        prepare(cbzPath);
    } else if (imagePath) {
        prepare(imagePath, true);
    }
});

ipcMain.on("open-image", async (event, imagePath) => {
    prepare(imagePath, isImage = true);
});

ipcMain.on("open-cbz", async (event, cbzPath) => {
    prepare(cbzPath);
});

ipcMain.on("request-page", async (event, { filePath, index }) => {
    try {
        // console.log("request-page", cbzPath, index);
        if (filePath && /\.(jpe?g|png|gif|webp|avif)$/i.test(filePath)) {
            const image = await loadSingleImage(filePath);
            event.sender.send("page-loaded", image);
            return;
        }

        const entries = imageEntries || await getImageEntries(filePath);
        if (index < entries.length) {
            const image = await loadImageByIndex(filePath, entries[index], index);
            event.sender.send("page-loaded", image);
        }
    } catch (err) {
        console.error(err);
    }
});

async function prepare(filePath, isImage = false) {
    try {
        let total;
        filePath = path.resolve(filePath);

        if (isImage) {
            total = 1;
        } else {
            imageEntries = await getImageEntries(filePath);
            total = imageEntries.length;
        }

        if (rendererReady) {
            mainWindow.webContents.send("show-images", { filePath, total, isImage });
        } else {
            pending = { filePath, total, isImage };
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadSingleImage(imagePath) {
    return new Promise((resolve, reject) => {
        if (!imagePath || !fs.existsSync(imagePath)) {
            return reject(new Error("Invalid image path"));
        }

        fs.readFile(imagePath, (err, buffer) => {
            if (err) return reject(err);

            resolve({
                buffer: buffer,
                ext: path.extname(imagePath).slice(1),
                fileName: path.basename(imagePath),
                pageNumber: 0
            });
        });
    });
}

async function getImageEntries(cbzPath) {
    if (!cbzPath || !fs.existsSync(cbzPath)) {
        throw new Error("Invalid CBZ path");
    }
    cbzPath = path.resolve(cbzPath);
    return new Promise((resolve, reject) => {
        yauzl.open(cbzPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);
            let entries = [];

            zipfile.readEntry();

            zipfile.on("entry", (entry) => {
                if (/\.(jpe?g|png|gif|webp|avif)$/i.test(entry.fileName)) {
                    entries.push(entry);
                }
                zipfile.readEntry();
            });

            zipfile.on("end", () => {
                zipfile.close();
                entries.sort((a, b) =>
                    a.fileName.localeCompare(b.fileName, undefined, { numeric: true })
                );
                resolve(entries);
            });

            zipfile.on("error", reject);
        });
    });
}

async function loadImageByIndex(cbzPath, entry, index) {
    return new Promise((resolve, reject) => {
        if (!cbzPath) {
            return reject(new Error("File path is empty"));
        }
        if (!entry) {
            return reject(new Error("Entry to load is empty"));
        }

        // console.log(entry.fileName);

        yauzl.open(cbzPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);

            zipfile.openReadStream(entry, (err, readStream) => {
                if (err) {
                    zipfile.close();
                    return reject(err);
                }

                const chunks = [];
                readStream.on("data", (c) => chunks.push(c));
                readStream.on("end", () => {
                    zipfile.close();
                    resolve({
                        buffer: Buffer.concat(chunks),
                        ext: path.extname(entry.fileName).slice(1),
                        fileName: entry.fileName,
                        pageNumber: index
                    });
                });
                readStream.on("error", (e) => {
                    zipfile.close();
                    reject(e);
                });
            });
        });
    });
}

app.on('close', (event) => {
    BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
            window.close();
        }
    });
});

ipcMain.on("renderer-ready", () => {
    rendererReady = true;
    if (pending) {
        mainWindow.webContents.send("show-images", pending);
        pending = null;
    }
});