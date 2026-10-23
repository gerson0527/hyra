import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hyra', {
  isDesktop: true,
  listLocalDir: (dirPath) => ipcRenderer.invoke('hyra:list-local-dir', dirPath),
  pickLocalFolder: () => ipcRenderer.invoke('hyra:pick-local-folder'),
  localDocuments: () => ipcRenderer.invoke('hyra:local-documents'),
  defaultLocalPath: () => ipcRenderer.invoke('hyra:default-local-path'),
  readHosts: () => ipcRenderer.invoke('hyra:read-hosts'),
  writeHosts: (content) => ipcRenderer.invoke('hyra:write-hosts', content),
  openHostsFile: () => ipcRenderer.invoke('hyra:open-hosts-file'),
})
