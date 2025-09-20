# simple-cbzreader
Electron based CBZ ebook reader

Press Q to quit. Supports opening with cmd and drag drop file.

For some reasons the exe file took me 30 seconds to open up. So to build it yourself (much faster):

  1.require npm
  
  2.run **build.bat** if you on windows

  3.run **register.bat** in **dist/win-unpacked** to register the exe to open cbz files

The output folder is in **dist/win-unpacked**. You can move or rename to whatever you want.

Likewise, run unregister.bat to remove your program from system.
