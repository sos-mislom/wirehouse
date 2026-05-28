const { contextBridge } = require("electron")

contextBridge.exposeInMainWorld("desktopShell", {
  channel: "windows",
})
