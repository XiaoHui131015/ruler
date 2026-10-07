// utils/screen.js
// 屏幕参数计算工具：获取设备信息，计算 1mm 对应的逻辑像素值

let screenInfo = null;

function getScreenInfo() {
  if (screenInfo) return screenInfo;

  const windowInfo = wx.getWindowInfo();
  const deviceInfo = wx.getDeviceInfo();

  // 优先从缓存读取锁定比例
  const lockedScale = wx.getStorageSync('ruler_locked_scale');

  // PPI 估算：需要屏幕对角线英寸数
  // 若无缓存，使用默认值或让用户首次输入
  const cachedPPI = wx.getStorageSync('ruler_ppi');
  const screenInch = wx.getStorageSync('ruler_screen_inch') || 6.1; // 默认值

  const ppi = cachedPPI || Math.sqrt(
    Math.pow(windowInfo.screenWidth * windowInfo.pixelRatio, 2) +
    Math.pow(windowInfo.screenHeight * windowInfo.pixelRatio, 2)
  ) / screenInch;

  // 1mm 对应的物理像素
  const mmToPhysical = ppi / 25.4;
  // 1mm 对应的逻辑像素（canvas 坐标单位）
  const mmToLogical = mmToPhysical / windowInfo.pixelRatio;

  screenInfo = {
    ppi,
    mmToLogical,
    pixelRatio: windowInfo.pixelRatio,
    screenWidth: windowInfo.screenWidth,
    screenHeight: windowInfo.screenHeight,
    isLandscape: windowInfo.screenWidth > windowInfo.screenHeight,
    lockedScale,
    screenInch
  };
  return screenInfo;
}

function clearCache() {
  screenInfo = null;
}

module.exports = { getScreenInfo, clearCache };
