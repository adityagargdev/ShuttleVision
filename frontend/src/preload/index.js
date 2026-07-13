import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  selectVideo:          ()     => ipcRenderer.invoke('select-video'),
  selectCsv:            ()     => ipcRenderer.invoke('select-csv'),
  selectOutDir:         ()     => ipcRenderer.invoke('select-out-dir'),
  selectAnalysisJson:   ()     => ipcRenderer.invoke('select-analysis-json'),
  runAnalysis:       (opts)   => ipcRenderer.invoke('run-analysis', opts),
  cancelAnalysis:    ()       => ipcRenderer.invoke('cancel-analysis'),
  loadAnalysis:      (path)   => ipcRenderer.invoke('load-analysis', path),
  askClaude:         (opts)   => ipcRenderer.invoke('ask-claude', opts),
  downloadVideo:     (opts)   => ipcRenderer.invoke('download-video', opts),
  exportHighlights:  (opts)   => ipcRenderer.invoke('export-highlights', opts),
  openFile:          (path)   => ipcRenderer.invoke('open-file', path),

  onProgress: (cb) => {
    ipcRenderer.on('analysis-progress', (_, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('analysis-progress')
  },
  onHighlightProgress: (cb) => {
    ipcRenderer.on('highlight-progress', (_, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('highlight-progress')
  },
  onDownloadProgress: (cb) => {
    ipcRenderer.on('download-progress', (_, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('download-progress')
  },
})
