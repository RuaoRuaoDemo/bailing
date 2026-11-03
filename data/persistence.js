/**
 * 百灵仪表盘 - 本地持久化
 * localStorage 读写 + 跨会话恢复
 */
(function(global){
  'use strict';
  const KEY_DATA = 'bailing_data';
  const KEY_SCHEDULE = 'bailing_schedule';

  function save(){
    const App = global.App;
    if (!App) return;
    try {
      const data = {
        rawRows: App.rawRows,
        nontaskRows: App.nontaskRows,
        utilRows: App.utilRows,
        utilRateOverrides: App.utilRateOverrides || {},
        ignoredKeys: [...App.ignoredKeys],
        manualRows: App.manualRows,
        manualDeletedKeys: [...App.manualDeletedKeys],
        thresholdLow: App.thresholdLow,
        thresholdHigh: App.thresholdHigh,
        pageSize: App.pageSize,
        sortField: App.sortField,
        sortDirection: App.sortDirection
      };
      localStorage.setItem(KEY_DATA, JSON.stringify(data));
    } catch(e) { console.warn('持久化失败', e); }
  }

  function load(){
    const App = global.App;
    if (!App) return;
    try {
      const raw = localStorage.getItem(KEY_DATA);
      if (raw){
        const d = JSON.parse(raw);
        if (d.rawRows) App.rawRows = d.rawRows;
        if (d.nontaskRows) App.nontaskRows = d.nontaskRows;
        if (d.utilRows) App.utilRows = d.utilRows;
        if (d.utilRateOverrides) App.utilRateOverrides = d.utilRateOverrides;
        if (d.ignoredKeys) App.ignoredKeys = new Set(d.ignoredKeys);
        if (d.manualRows) App.manualRows = d.manualRows;
        if (d.manualDeletedKeys) App.manualDeletedKeys = new Set(d.manualDeletedKeys);
        if (Number.isFinite(Number(d.thresholdLow))) App.thresholdLow = Number(d.thresholdLow);
        if (Number.isFinite(Number(d.thresholdHigh))) App.thresholdHigh = Number(d.thresholdHigh);
        if (Number.isFinite(Number(d.pageSize))) App.pageSize = Number(d.pageSize);
        if (d.sortField) App.sortField = d.sortField;
        if (d.sortDirection) App.sortDirection = d.sortDirection;
      }
    } catch(e) {}
    loadSchedule();
  }

  function saveSchedule(){
    const App = global.App;
    if (!App) return;
    try { localStorage.setItem(KEY_SCHEDULE, JSON.stringify({ map: App.scheduleMap, matrix: App.scheduleMatrix })); } catch(e){}
  }

  function loadSchedule(){
    const App = global.App;
    if (!App) return;
    try {
      const raw = localStorage.getItem(KEY_SCHEDULE);
      if (raw){
        const d = JSON.parse(raw);
        if (d.map) App.scheduleMap = d.map;
        if (d.matrix) App.scheduleMatrix = d.matrix;
      }
    } catch(e) {}
  }

  function clear(){
    try {
      localStorage.removeItem(KEY_DATA);
      localStorage.removeItem(KEY_SCHEDULE);
    } catch(e) {}
  }

  global.BailingPersistence = { save, load, saveSchedule, loadSchedule, clear };
})(typeof window !== 'undefined' ? window : this);
// 全量更新 2026-05-27
