/**
 * 百灵仪表盘 - 全局状态仓库（App）
 * 所有跨模块共享的数据、映射表、配置都挂这里
 * 通过 BailingStore.App 访问；视图层只读或通过 action 函数修改
 */
(function(global){
  'use strict';

  // 默认 App 状态（与原代码中 App 对象保持完全一致）
  const App = {
    // 原始数据
    rawRows: [],           // 工作量表
    nontaskRows: [],       // 非任务表
    utilRows: [],          // 工时利用率底表
    dailyData: [],         // 合并后的每日汇总
    filteredData: [],      // 按筛选条件过滤后的
    manualRows: [],        // 手工录入的汇总行
    scheduleMap: {},       // 员工×日期 → 班次代码
    scheduleMatrix: [],    // 班次矩阵

    // 员工标识映射（必须在 calcAll 时重建，防止 localStorage 丢失）
    empUinMap: new Map(),  // 中文 → UIN
    uinToEmpMap: new Map(),// UIN → 中文
    empEnMap: new Map(),   // 中文 → 英文
    enToCnMap: new Map(),  // 英文 → 中文
    empDateHours: new Map(),// (员工|日期) → {nontaskMin, tongMin, nontongMin, timingMin}

    // 用户选择状态
    ignoredKeys: new Set(),
    manualDeletedKeys: new Set(),
    selectedRowKeys: new Set(),
    alertHidden: false,
    currentPage: 1,
    pageSize: 20,
    sortField: 'abnormal',
    sortDirection: 'desc',

    // 阈值
    thresholdLow: 995,
    thresholdHigh: 1005,

    // 分组规则
    groupRules: [],
    groupExclude: {},
    orgPeriodConfig: {},

    // 修正值
    utilRateOverrides: {},  // key(emp|date) → rate

    // Chart 实例引用（避免重渲染时内存泄漏）
    boardInited: false,
    utilTrendChart: null,
    taskTrendChart: null,
    workloadPieChart: null,
    personPieChart: null,
    auditWorkChart: null,
    auditNontaskChart: null,
    auditWorkPersonChart: null,
    auditNontaskPersonChart: null,
    detailDoughnut: null,
    detailPeriodChart: null,

    // 图表展开状态
    auditChartExpand: { work: false, nt: false },

    // 其他状态
    debugMode: false
  };

  // reset 函数
  function reset(){
    App.rawRows = [];
    App.nontaskRows = [];
    App.utilRows = [];
    App.dailyData = [];
    App.filteredData = [];
    App.scheduleMap = {};
    App.scheduleMatrix = [];
    App.manualRows = [];
    App.manualDeletedKeys.clear();
    App.selectedRowKeys.clear();
    App.ignoredKeys.clear();
    App.alertHidden = false;
    App.empUinMap.clear();
    App.uinToEmpMap.clear();
    App.empEnMap.clear();
    App.enToCnMap.clear();
    App.empDateHours.clear();
    App.utilRateOverrides = {};
  }

  // 重建员工标识映射（从 rawRows 和 nontaskRows）
  function rebuildEmpMaps(){
    App.empUinMap.clear();
    App.uinToEmpMap.clear();
    App.empEnMap.clear();
    App.enToCnMap.clear();
    const addMap = (emp, empEn, uin) => {
      if (emp && uin){ App.empUinMap.set(emp, uin); App.uinToEmpMap.set(uin, emp); }
      if (emp && empEn){ App.empEnMap.set(emp, empEn); App.enToCnMap.set(empEn, emp); }
      if (!emp && empEn && uin){ App.enToCnMap.set(empEn, uin); App.uinToEmpMap.set(uin, empEn); }
    };
    (App.rawRows || []).forEach(r => addMap(r._emp, r._empEn, r._uin));
    (App.nontaskRows || []).forEach(r => addMap(r._emp, r._empEn, r._uin));
  }

  global.BailingStore = { App, reset, rebuildEmpMaps };
  // 暴露 App 为全局变量，兼容现有代码
  global.App = App;
// 全量更新 2026-05-27
})(typeof window !== 'undefined' ? window : this);
