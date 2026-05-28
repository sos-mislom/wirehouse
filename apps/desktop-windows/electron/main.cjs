const path = require("node:path")
const { app, BrowserWindow, shell } = require("electron")

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: "#0a1423",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devServerUrl = process.env.WAREHOUSE_APP_DEV_SERVER_URL
  const remoteShellUrl = process.env.WAREHOUSE_APP_REMOTE_URL

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
  } else if (remoteShellUrl) {
    mainWindow.loadURL(remoteShellUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
