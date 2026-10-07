const { getScreenInfo, clearCache } = require('../../utils/screen.js');

Page({
  data: {
    reading: '',
    isFlipped: true,    // 翻转：竖直尺子初始贴在左边缘，可切换到右边缘
    isMirrored: false,  // 调转：0 刻度从顶部切换到底部（数值向上递增）
    isLandscape: false,
    showCalibration: false,
    scalePercent: 100,
    isLocked: false,
    statusBarHeight: 0
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo();
    const lockedScale = wx.getStorageSync('ruler_locked_scale');
    this.measureLineY = null; // 测量线初始不显示
    this.tempScale = null;    // 校准滑块拖动时的临时比例
    this.setData({
      isLandscape: windowInfo.screenWidth > windowInfo.screenHeight,
      isLocked: !!lockedScale,
      scalePercent: lockedScale ? lockedScale * 100 : 100,
      statusBarHeight: windowInfo.statusBarHeight || 0
    });
    // 屏幕旋转或尺寸变化监听（折叠屏接口预留）
    wx.onWindowResize((res) => {
      this.onResize(res);
    });
  },

  onReady() {
    this.initCanvas();
  },

  initCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#rulerCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const { pixelRatio } = getScreenInfo();
        const { width, height } = res[0];
        // 设置画布物理像素尺寸
        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;
        ctx.scale(pixelRatio, pixelRatio);
        this.canvas = canvas;
        this.ctx = ctx;
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.drawRuler();
      });
  },

  // 有效比例：拖动预览值优先，其次锁定值，默认 1
  getScale() {
    const { lockedScale } = getScreenInfo();
    return this.tempScale || lockedScale || 1;
  },

  getMmToPx() {
    const { mmToLogical } = getScreenInfo();
    return mmToLogical * this.getScale();
  },

  // 竖直尺子绘制（由水平尺子顺时针旋转 90°）：
  // 默认刻度基线贴在屏幕左边缘，0 刻度在顶部，数值向下递增，刻度线向右延伸
  drawRuler() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { isFlipped, isMirrored } = this.data;
    const mmToPx = this.getMmToPx();
    const width = this.canvasWidth;
    const height = this.canvasHeight;

    // 清除画布
    ctx.clearRect(0, 0, width, height);

    // 尺身沿屏幕边缘竖直排布
    const rulerW = width * 0.35; // 尺身横向宽度（逻辑像素）
    // 翻转时尺身贴左边缘，默认贴右边缘
    const baseX = isFlipped ? 0 : width;      // 刻度基线所在 X（屏幕边缘）
    const dir = isFlipped ? 1 : -1;           // 刻度线由边缘向内的方向
    const stripX = isFlipped ? 0 : width - rulerW;

    // 绘制尺身边框
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(stripX, 0, rulerW, height);

    // 绘制刻度
    ctx.strokeStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const totalMm = Math.floor(height / mmToPx);
    for (let mm = 0; mm <= totalMm; mm++) {
      // 调转时 Y 坐标镜像：0 刻度在底部，数值向上递增
      const y = isMirrored ? height - mm * mmToPx : mm * mmToPx;
      let lineLength, lineWidth;
      if (mm % 10 === 0) {
        // 主刻度：每 10mm = 1cm
        lineLength = rulerW * 0.5;
        lineWidth = 1.5;
        // 数字标注（cm）
        ctx.fillStyle = '#000';
        const labelX = baseX + dir * rulerW * 0.75;
        ctx.fillText(String(mm / 10), labelX, y);
      } else if (mm % 5 === 0) {
        // 中刻度
        lineLength = rulerW * 0.35;
        lineWidth = 1;
      } else {
        // 短刻度
        lineLength = rulerW * 0.2;
        lineWidth = 0.5;
      }
      ctx.beginPath();
      ctx.lineWidth = lineWidth;
      // 刻度从屏幕边缘（基线）向内延伸
      ctx.moveTo(baseX, y);
      ctx.lineTo(baseX + dir * lineLength, y);
      ctx.stroke();
    }

    // 绘制测量线（如果有上次位置）
    if (this.measureLineY !== null) {
      this.drawMeasureLine(this.measureLineY);
    }
  },

  drawMeasureLine(y) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = '#07c160';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.moveTo(0, y);
    ctx.lineTo(this.canvasWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);
  },

  onTouchStart(e) {
    const touch = e.touches[0];
    // touch.y 是相对 canvas 的坐标（逻辑像素）
    this.updateMeasureLine(touch.y);
  },

  onTouchMove(e) {
    const touch = e.touches[0];
    this.updateMeasureLine(touch.y);
  },

  onTouchEnd() {
    // 保留最后位置，不做清除
  },

  updateMeasureLine(y) {
    if (this.canvasHeight === undefined) return;
    // 边界限制
    if (y < 0) y = 0;
    if (y > this.canvasHeight) y = this.canvasHeight;
    this.measureLineY = y;
    this.drawRuler(); // 重绘
    // 计算读数（调转时读数方向同样镜像）
    const mmToPx = this.getMmToPx();
    const effectiveY = this.data.isMirrored ? this.canvasHeight - y : y;
    const readingMm = effectiveY / mmToPx;
    const readingCm = (readingMm / 10).toFixed(2);
    this.setData({ reading: readingCm });
  },

  toggleFlip() {
    this.setData({ isFlipped: !this.data.isFlipped });
    this.drawRuler();
  },

  toggleMirror() {
    this.setData({ isMirrored: !this.data.isMirrored });
    this.drawRuler();
  },

  openCalibration() {
    const current = this.getScale();
    this.setData({
      showCalibration: true,
      scalePercent: Math.round(current * 100 * 2) / 2
    });
  },

  closeCalibration() {
    this.setData({ showCalibration: false });
  },

  onScaleChanging(e) {
    const percent = e.detail.value;
    this.tempScale = percent / 100;
    this.setData({ scalePercent: percent });
    // 临时应用比例，实时预览
    this.drawRuler();
  },

  onScaleChange(e) {
    // 确认比例
    this.tempScale = e.detail.value / 100;
    this.setData({ scalePercent: e.detail.value });
    this.drawRuler();
  },

  resetCalibration() {
    this.tempScale = 1;
    this.setData({ scalePercent: 100 });
    this.drawRuler();
  },

  toggleLock() {
    if (this.data.isLocked) {
      // 解锁
      wx.removeStorageSync('ruler_locked_scale');
      clearCache();
      this.setData({ isLocked: false });
    } else {
      // 锁定：保存当前比例
      const scale = this.tempScale || 1;
      wx.setStorageSync('ruler_locked_scale', scale);
      clearCache();
      this.tempScale = null;
      this.setData({ isLocked: true });
    }
    this.drawRuler();
  },

  onResize() {
    // 屏幕旋转或尺寸变化时触发
    const windowInfo = wx.getWindowInfo();
    const wasLandscape = this.data.isLandscape;
    const isLandscape = windowInfo.screenWidth > windowInfo.screenHeight;
    if (wasLandscape !== isLandscape) {
      // 清空屏幕信息缓存，重新计算
      clearCache();
      this.setData({ isLandscape });
      // 旋转后测量线位置可能超出新边界
      if (this.measureLineY !== null) {
        this.measureLineY = Math.min(this.measureLineY, windowInfo.screenHeight);
      }
      // 重新初始化 canvas
      this.initCanvas();
    }
  },

  saveImage() {
    if (!this.canvas) return;
    wx.canvasToTempFilePath({
      canvas: this.canvas,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.showToast({ title: '已保存到相册', icon: 'success' });
          },
          fail: (err) => {
            if (err.errMsg && err.errMsg.indexOf('auth deny') > -1) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中允许保存图片到相册',
                success: (modalRes) => {
                  if (modalRes.confirm) wx.openSetting();
                }
              });
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
          }
        });
      }
    });
  }
});
