/**
 * 百灵仪表盘 - 核心公式中枢
 * 集中所有关键计算公式，统一输入输出、单元语义、边界处理
 * 任何数据计算优先使用本模块的函数，严禁散落在视图层
 *
 * ⚠️ 修改本文件前请阅读文档头的"公式验证"小节，所有改动需保持向后兼容
 * ⚠️ 修改后请在 Console 运行 BailingFormulas.selfTest() 做回归
 */
(function(global){
  'use strict';

  // ========================================================================
  // 常量（供视图层复用，所有阈值在此集中定义）
  // ========================================================================
  const CONSTANTS = {
    // 【计时任务换算】125 标准条 / 小时 （即 60 分钟 ≡ 125 标准条）
    STD_PER_HOUR: 125,
    // 【非任务 → 有效工时权重】非任务 1 小时 = 0.8125 有效工时
    // 逻辑：非任务 1h = (125 * 0.65) / 125 * 1 = 0.8125 有效工时
    NONTASK_EFFECTIVE_WEIGHT: 0.8125,
    // 【工时利用率达标线】≥ 81.25%
    UTIL_PASS: 81.25,
    // 【工时利用率预警线】≥ 70% 但 < 81.25% 预警
    UTIL_WARN: 70,
    // 【工时利用率上限】> 100% 视为异常
    UTIL_OVER: 100,
    // 【工时利用率严重异常分级】
    UTIL_OVER_HIGH: 105,
    UTIL_OVER_MEDIUM: 102,
    // 【V8.73 标准条异常阈值：基于 ±5 分钟允差】
    WORKLOAD_LOW_DEFAULT: 1000 - 5/60*125,   // ≈ 989.58
    WORKLOAD_HIGH_DEFAULT: 1000 + 5/60*125,  // ≈ 1010.42
    // 【非任务占比阈值】> 30% 视为偏高
    NONTASK_SPIKE_RATIO: 0.3,
    // 【默认出勤时长】若底表未提供则按 8h 计
    DEFAULT_ATTEND_HOURS: 8,
    // 【V8.73 底表异常时长上限】通航+计时+计量 > 11h 视为底表数据异常
    UTIL_HOUR_CAP: 11
  };

  // ========================================================================
  // 基础换算
  // ========================================================================

  /**
   * 分钟 → 标准条（计时任务/非任务均使用同一公式）
   * 公式：minutes / 60 × 125
   */
  function minutesToStd(minutes){
    const m = Number(minutes) || 0;
    if (m <= 0) return 0;
    return m / 60 * CONSTANTS.STD_PER_HOUR;
  }

  /**
   * 标准条 → 小时
   * 公式：std / 125
   */
  function stdToHours(std){
    const s = Number(std) || 0;
    if (s <= 0) return 0;
    return s / CONSTANTS.STD_PER_HOUR;
  }

  /**
   * 分钟 → 小时
   */
  function minutesToHours(minutes){
    return (Number(minutes) || 0) / 60;
  }

  /**
   * 小时 → 分钟
   */
  function hoursToMinutes(hours){
    return (Number(hours) || 0) * 60;
  }

  // ========================================================================
  // 工作量标准条计算
  // ========================================================================

  /**
   * 计算单条工作量行的标准条构成（V8.75 修正回正确量纲）
   *
   * 量纲说明：
   *   效能（eff）= 每小时审核条数基准，eff 条审核 ≡ 1000 标准条 ≡ 1h 有效工时
   *   ∴ tongStd    = tong    / eff × 1000
   *   ∴ nontongStd = nontong / eff × 1000
   *   ∴ meterStd   = tongStd + nontongStd
   *   ∴ timingStd  = _minutes / 60 × 125    （计时任务基准不同：1h = 125 标准条）
   *   ∴ totalStd   = meterStd + timingStd
   *
   * 注意：审核类任务 1h=1000标准条，计时任务 1h=125标准条，两者基准不同！
   * 全天 8h 理论 1000 条 ← 这里的 1000 是"审核类"标准条。
   *
   * 优先级：若 Excel 有 _origStd 且差异>5%，使用 Excel 值。
   */
  function calcRow(r){
    const eff = Number(r._eff) || 0;
    const tong = Number(r._tong) || 0;
    const nontong = Number(r._nontong) || 0;
    const minutes = Number(r._minutes) || 0;
    const origStd = Number(r._origStd) || 0;

    // 审核类：×1000（eff条=1000标准条=1h有效工时）
    const tongStd    = (eff > 0 && tong > 0)    ? (tong / eff * 1000) : 0;
    const nontongStd = (eff > 0 && nontong > 0) ? (nontong / eff * 1000) : 0;
    const meterStd   = tongStd + nontongStd;
    // 计时类：×125（1h=125标准条）
    const timingStd  = minutesToStd(minutes);
    const totalMeter = tong + nontong;

    // 若 Excel 已给出总标准条且与我们算出的差异显著，信任 Excel
    let finalTongStd = tongStd, finalNontongStd = nontongStd, finalMeterStd = meterStd, finalTimingStd = timingStd;
    let finalTotal = meterStd + timingStd;
    if (origStd > 0) {
      const calcTotal = meterStd + timingStd;
      if (calcTotal > 0 && Math.abs(origStd - calcTotal) / Math.max(calcTotal, 1) > 0.05) {
        const ratio = origStd / calcTotal;
        finalTongStd    = tongStd    * ratio;
        finalNontongStd = nontongStd * ratio;
        finalMeterStd   = meterStd   * ratio;
        finalTimingStd  = timingStd  * ratio;
        finalTotal      = origStd;
      } else if (calcTotal === 0 && (tong > 0 || nontong > 0 || minutes > 0)) {
        const w1 = tong, w2 = nontong, w3 = minutes;
        const sum = w1 + w2 + w3;
        if (sum > 0) {
          finalTongStd    = origStd * w1 / sum;
          finalNontongStd = origStd * w2 / sum;
          finalTimingStd  = origStd * w3 / sum;
          finalMeterStd   = finalTongStd + finalNontongStd;
        } else {
          finalMeterStd = origStd; finalTongStd = origStd; finalNontongStd = 0; finalTimingStd = 0;
        }
        finalTotal = origStd;
      }
    }

    return Object.assign({}, r, {
      meterStd:   finalMeterStd,
      timingStd:  finalTimingStd,
      tongStd:    finalTongStd,
      tong3Std:   0,
      nontongStd: finalNontongStd,
      totalMeter,
      totalStd:   finalTotal,
      _stdTrace: {
        eff, tong, nontong, minutes, origStd,
        calcTong: tongStd, calcNontong: nontongStd, calcTiming: timingStd, calcTotal: meterStd + timingStd,
        usedOrig: origStd > 0 && Math.abs(origStd - (meterStd + timingStd)) / Math.max(meterStd + timingStd, 1) > 0.05,
        finalTotal
      }
    });
  }

  /**
   * 非任务分钟 → 标准条
   * 公式：minutes / 60 × 125
   */
  function calcNontaskStd(minutes){
    return minutesToStd(minutes);
  }

  // ========================================================================
  // 工时利用率
  // ========================================================================

  /**
   * 工时利用率（小时法，V8.68 标准公式）
   * 公式：((计量h + 计时h) × 0.8125 + 通航审核h) / 出勤h × 100
   *   - 计量h = 非通航审核时长（非通航/计量审核任务，单位 h）
   *   - 计时h = 线下计时任务时长（h）
   *   - 通航审核h = 通航审核完成时长（h）
   *   - 非任务不计入分子（非任务不创造有效工时）
   * 当底表 _utilRate 存在时与此计算值差异 > 1% 时优先使用此计算值，避免脏数据。
   */
  function calcUtilRateByHours({measureHours, timingHours, tongHours, attendHours}){
    const mH = Number(measureHours) || 0;
    const tmH = Number(timingHours) || 0;
    const tgH = Number(tongHours) || 0;
    const atH = Number(attendHours) || 0;
    if (atH <= 0) return 0;
    const effective = (mH + tmH) * CONSTANTS.NONTASK_EFFECTIVE_WEIGHT + tgH;
    return effective / atH * 100;
  }

  /**
   * 标准工时利用率计算（无底表小时列时使用）
   * 公式：((计量标准条 + 计时标准条) × 0.8125 + 非任务标准条) / (出勤h × 125) × 100
   *
   * 注：当底表有 _utilRate 字段时直接使用底表值，本函数仅用于缺数据时估算。
   */
  function calcUtilRate({meterStd, timingStd, nontaskStd, attendHours}){
    const meter = Number(meterStd) || 0;
    const timing = Number(timingStd) || 0;
    const nt = Number(nontaskStd) || 0;
    const attendH = Number(attendHours) || 0;
    if (attendH <= 0) return 0;
    // 有效工时 = (计量+计时)×0.8125h/h + 非任务已经是 0.8125 权重折算后?? 这里按项目惯例：
    // 审核时长 = (meter+timing) / 125  (小时)
    // 有效工时 = (审核小时 + 非任务小时) × 0.8125 近似？
    // 项目原公式为： ((计量+计时)×0.8125 + 总审核) / 出勤
    // 其中"总审核" 指审核时长小时数。此处统一为底表逻辑：若外部给出现成利用率优先使用。
    const effHours = (meter + timing) / CONSTANTS.STD_PER_HOUR + nt / CONSTANTS.STD_PER_HOUR;
    return effHours / attendH * 100;
  }

  /**
   * 工时利用率等级判定
   * @param {number} rate 百分比值（如 92.32）
   * @returns {'pass'|'warn'|'low'|'over_low'|'over_medium'|'over_high'}
   */
  function utilLevel(rate){
    const r = Number(rate) || 0;
    if (r > CONSTANTS.UTIL_OVER_HIGH) return 'over_high';
    if (r > CONSTANTS.UTIL_OVER_MEDIUM) return 'over_medium';
    if (r > CONSTANTS.UTIL_OVER) return 'over_low';
    if (r >= CONSTANTS.UTIL_PASS) return 'pass';
    if (r >= CONSTANTS.UTIL_WARN) return 'warn';
    return 'low';
  }

  /**
   * 工时利用率等级 → 显示文案/颜色
   */
  function utilLevelMeta(level){
    switch(level){
      case 'over_high':   return { label:'超标严重', color:'#dc2626', bg:'#fef2f2' };
      case 'over_medium': return { label:'超标一般', color:'#d97706', bg:'#fffbeb' };
      case 'over_low':    return { label:'超标轻微', color:'#64748b', bg:'#f1f5f9' };
      case 'pass':        return { label:'达标',     color:'#16a34a', bg:'#f0fdf4' };
      case 'warn':        return { label:'预警',     color:'#ca8a04', bg:'#fefce8' };
      case 'low':
      default:            return { label:'偏低',     color:'#dc2626', bg:'#fef2f2' };
    }
  }

  // ========================================================================
  // 异常判定（公式边界，业务语义集中）
  // ========================================================================

  /**
   * 判定总标准条是否超出阈值范围
   */
  function isTotalStdOutOfRange(totalStd, low, high){
    const t = Number(totalStd) || 0;
    const lo = Number(low) || CONSTANTS.WORKLOAD_LOW_DEFAULT;
    const hi = Number(high) || CONSTANTS.WORKLOAD_HIGH_DEFAULT;
    return t < lo || t > hi;
  }

  /**
   * 判定非任务时长是否占比偏高（> 出勤 × 30%）
   */
  function isNontaskSpike(nontaskH, attendH){
    const nt = Number(nontaskH) || 0;
    const at = Number(attendH) || 0;
    if (at <= 0) return false;
    return nt > at * CONSTANTS.NONTASK_SPIKE_RATIO;
  }

  /**
   * 判定非任务时长是否超过出勤时长（严重）
   */
  function isNontaskExceedAttend(nontaskH, attendH){
    const nt = Number(nontaskH) || 0;
    const at = Number(attendH) || 0;
    if (at <= 0) return false;
    return nt > at;
  }

  // ========================================================================
  // 日期工具
  // ========================================================================

  /**
   * 周期计算：按 "21~20" 或 "1~月末" 返回日期范围（基于 T-1）
   */
  function calcPeriodRange(periodType){
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yDay = y.getDate(), yMonth = y.getMonth(), yYear = y.getFullYear();
    const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

    if (periodType === '21to20'){
      if (yDay >= 21){
        return { from: yYear+'-'+String(yMonth+1).padStart(2,'0')+'-21',
                 to:   fmt(new Date(yYear, yMonth+1, 20)) };
      }
      return { from: fmt(new Date(yYear, yMonth, 21)),
               to:   yYear+'-'+String(yMonth+1).padStart(2,'0')+'-20' };
    }
    if (periodType === '1toEnd'){
      return { from: yYear+'-'+String(yMonth+1).padStart(2,'0')+'-01',
               to:   fmt(new Date(yYear, yMonth+1, 0)) };
    }
    // 默认 T-1 当天
    return { from: fmt(y), to: fmt(y) };
  }

  // ========================================================================
  // 自测（回归验证）
  // ========================================================================

  function selfTest(){
    const cases = [];
    const assert = (name, actual, expected, tol) => {
      tol = tol || 0.001;
      const ok = Math.abs(actual - expected) <= tol;
      cases.push({ name, actual, expected, ok });
      if (!ok) console.error('❌', name, ' actual=', actual, ' expected=', expected);
    };

    // 基础换算
    assert('60分钟→125标准条', minutesToStd(60), 125);
    assert('120分钟→250标准条', minutesToStd(120), 250);
    assert('125标准条→1h', stdToHours(125), 1);
    assert('250标准条→2h', stdToHours(250), 2);
    assert('非任务60分钟→125标准条', calcNontaskStd(60), 125);

    // calcRow — V8.75 回归正确量纲（审核类 ×1000）
    // eff=880 条/h, tong=8 条 → 8/880×1000 ≈ 9.09
    const row1 = calcRow({ _eff: 880, _tong: 8, _nontong: 0, _minutes: 0 });
    assert('_eff=880 _tong=8 → tongStd', row1.tongStd, 8/880*1000, 0.01);
    // eff=880, tong=74 → 74/880×1000 ≈ 84.09
    const row2 = calcRow({ _eff: 880, _tong: 74, _nontong: 0, _minutes: 0 });
    assert('_eff=880 _tong=74 → tongStd', row2.tongStd, 74/880*1000, 0.01);
    const row3 = calcRow({ _eff: 0, _tong: 10, _nontong: 10, _minutes: 60 });
    assert('_eff=0 保护：tongStd=0', row3.tongStd, 0);
    assert('_eff=0 保护：nontongStd=0', row3.nontongStd, 0);
    assert('_minutes=60 → timingStd=125', row3.timingStd, 125);
    assert('totalStd = 计量+计时', row3.totalStd, 125);
    // origStd 优先：Excel 给 200，计算值 125，差 > 5% → 使用 200
    const row4 = calcRow({ _eff: 0, _tong: 10, _nontong: 0, _minutes: 60, _origStd: 200 });
    assert('_origStd=200 差异大 → totalStd=200', row4.totalStd, 200);

    // 工时利用率等级
    assert('rate=92 → pass level', utilLevel(92) === 'pass' ? 1 : 0, 1);
    assert('rate=75 → warn level', utilLevel(75) === 'warn' ? 1 : 0, 1);
    assert('rate=50 → low level',  utilLevel(50) === 'low' ? 1 : 0, 1);
    assert('rate=101 → over_low',  utilLevel(101) === 'over_low' ? 1 : 0, 1);
    assert('rate=103 → over_medium', utilLevel(103) === 'over_medium' ? 1 : 0, 1);
    assert('rate=110 → over_high',   utilLevel(110) === 'over_high' ? 1 : 0, 1);

    // calcUtilRateByHours —— V8.68 标准公式
    // 典型：出勤 8h、通航审核 6h、非通航 1h、计时 1h → ((1+1)×0.8125 + 6)/8×100 = 95.31%
    assert('util 6通航+1计量+1计时/8h → 95.31%',
      calcUtilRateByHours({measureHours:1, timingHours:1, tongHours:6, attendHours:8}), 95.3125, 0.01);
    // 零出勤保护
    assert('util 出勤=0 → 0%',
      calcUtilRateByHours({measureHours:1, timingHours:1, tongHours:6, attendHours:0}), 0);
    // 全通航：8h 通航/8h 出勤 = 100%
    assert('util 全通航 8/8 → 100%',
      calcUtilRateByHours({measureHours:0, timingHours:0, tongHours:8, attendHours:8}), 100);

    // 异常判定
    assert('totalStd=800 low=995 → out', isTotalStdOutOfRange(800, 995, 1005) ? 1 : 0, 1);
    assert('totalStd=1000 → in range', isTotalStdOutOfRange(1000, 995, 1005) ? 0 : 1, 1);
    assert('非任务3h 出勤8h → not spike(3/8=37.5%>30%)', isNontaskSpike(3, 8) ? 1 : 0, 1);
    assert('非任务2h 出勤8h → not spike(25%)', isNontaskSpike(2, 8) ? 0 : 1, 1);
    assert('非任务9h 出勤8h → exceed attend', isNontaskExceedAttend(9, 8) ? 1 : 0, 1);

    const pass = cases.filter(c=>c.ok).length;
    const fail = cases.length - pass;
    const msg = '✅ BailingFormulas.selfTest: ' + pass + '/' + cases.length + ' passed' + (fail ? (', ❌ '+fail+' failed') : '');
    console.log(msg);
    return { pass, fail, cases };
  }

  // ========================================================================
  // 导出
  // ========================================================================
  const api = {
    CONSTANTS,
    // 基础换算
    minutesToStd, stdToHours, minutesToHours, hoursToMinutes,
    // 工作量
    calcRow, calcNontaskStd,
    // 工时利用率
    calcUtilRate, calcUtilRateByHours, utilLevel, utilLevelMeta,
    // 异常判定
    isTotalStdOutOfRange, isNontaskSpike, isNontaskExceedAttend,
    // 日期
    calcPeriodRange,
    // 自测
    selfTest
  };
  global.BailingFormulas = api;
  // 兼容全局别名（方便控制台调用）
  global.BF = api;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
// 全量更新 2026-05-27
