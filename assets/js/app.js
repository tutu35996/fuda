class FudaCertificateEditor {
  constructor() {
    this.canvas = document.getElementById("certificateCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.templateGroups = [
      { key: "english", label: "英语", dir: "english", count: 10 },
      { key: "portuguese", label: "葡萄牙语", dir: "portuguese", count: 10 },
      { key: "arabic", label: "阿拉伯语", dir: "arabic", count: 10 },
      { key: "hungarian", label: "匈牙利语", dir: "hungarian", count: 10 }
    ];

    this.gradientStops = [
      { offset: 0, color: "#fed491" },
      { offset: 0.35, color: "#febe71" },
      { offset: 0.68, color: "#df894d" },
      { offset: 1, color: "#cb6937" }
    ];

    this.textStyles = {
      name: {
        fontFamily: '"FudaNameFont"',
        gradientStops: this.gradientStops,
        glow: "soft-gold"
      },
      uid: {
        fontFamily: '"FudaUidFont"',
        gradientStops: this.gradientStops,
        glow: false
      }
    };

    this.defaultState = {
      templateGroup: "english",
      templateIndex: 1,
      avatar: {
        x: 398,
        y: 289,
        size: 249,
        image: null,
        imageSrc: ""
      },
      name: {
        value: "",
        x: 525,
        y: 609,
        fontSize: 71,
        anchor: "baseline-center",
        styleKey: "name"
      },
      uid: {
        value: "",
        x: 486,
        y: 649,
        fontSize: 39,
        anchor: "baseline-left",
        styleKey: "uid"
      }
    };

    this.editorState = this.createInitialState();
    this.templateImage = new Image();
    this.templateMeta = {
      width: 1024,
      height: 1536,
      label: "英语 01",
      dir: "english",
      indexLabel: "01"
    };
    this.draggingLayer = null;

    this.dom = {
      templateGroups: document.getElementById("templateGroups"),
      templateCount: document.getElementById("templateCount"),
      currentTemplateLabel: document.getElementById("currentTemplateLabel"),
      currentTemplateMeta: document.getElementById("currentTemplateMeta"),
      coordsDisplay: document.getElementById("coordsDisplay"),
      loadingOverlay: document.getElementById("loadingOverlay"),
      errorOverlay: document.getElementById("errorOverlay"),
      retryBtn: document.getElementById("retryBtn"),
      downloadBtn: document.getElementById("downloadBtn"),
      copyBtn: document.getElementById("copyBtn"),
      nameInput: document.getElementById("nameInput"),
      nameFontSizeInput: document.getElementById("nameFontSizeInput"),
      uidInput: document.getElementById("uidInput")
    };
  }

  createInitialState() {
    return {
      templateGroup: this.defaultState.templateGroup,
      templateIndex: this.defaultState.templateIndex,
      avatar: {
        ...this.defaultState.avatar,
        image: null,
        imageSrc: ""
      },
      name: { ...this.defaultState.name },
      uid: { ...this.defaultState.uid }
    };
  }

  async init() {
    this.renderTemplateGroups();
    this.bindEvents();
    this.syncAllInputs();
    this.updateTemplateSummary();
    this.updateCoordsDisplay();
    await this.loadFonts();
    this.selectTemplate(this.editorState.templateGroup, this.editorState.templateIndex);
  }

  async loadFonts() {
    if (!document.fonts || !document.fonts.load) {
      return;
    }

    try {
      await Promise.all([
        document.fonts.load('72px "FudaNameFont"'),
        document.fonts.load('48px "FudaUidFont"')
      ]);
    } catch (error) {
      console.warn("字体加载未完全成功，继续使用预览：", error);
    }
  }

  renderTemplateGroups() {
    const totalTemplates = this.templateGroups.reduce((sum, group) => sum + group.count, 0);
    this.dom.templateCount.textContent = `${totalTemplates} 张`;
    this.dom.templateGroups.innerHTML = this.templateGroups
      .map((group) => {
        const buttons = Array.from({ length: group.count }, (_, index) => {
          const templateIndex = index + 1;
          const label = String(templateIndex).padStart(2, "0");
          return `
            <button
              type="button"
              class="template-btn"
              data-group="${group.key}"
              data-index="${templateIndex}"
            >${label}</button>
          `;
        }).join("");

        return `
          <section class="template-group">
            <div class="template-group-header">
              <div class="template-group-title">
                <i class="fa-solid fa-images"></i>
                <span>${group.label}</span>
              </div>
              <span class="template-group-subtitle">${group.count} 张</span>
            </div>
            <div class="template-grid">${buttons}</div>
          </section>
        `;
      })
      .join("");
  }

  bindEvents() {
    this.dom.templateGroups.addEventListener("click", (event) => {
      const button = event.target.closest(".template-btn");
      if (!button) {
        return;
      }

      this.selectTemplate(button.dataset.group, Number(button.dataset.index));
    });

    this.dom.retryBtn.addEventListener("click", () => {
      this.loadCurrentTemplate();
    });

    this.dom.downloadBtn.addEventListener("click", () => this.downloadCertificate());
    this.dom.copyBtn.addEventListener("click", () => this.copyCertificate());
    this.dom.nameInput.addEventListener("input", () => {
      this.editorState.name.value = this.dom.nameInput.value;
      this.draw();
    });

    this.dom.nameFontSizeInput.addEventListener("input", () => {
      this.updateTextNumeric("name", "fontSize", this.dom.nameFontSizeInput.value, 1);
    });

    this.dom.uidInput.addEventListener("input", () => {
      this.editorState.uid.value = this.dom.uidInput.value;
      this.draw();
    });
  }

  getTemplateConfig(groupKey, index) {
    const group = this.templateGroups.find((item) => item.key === groupKey) || this.templateGroups[0];
    const safeIndex = Math.min(group.count, Math.max(1, index));
    const indexLabel = String(safeIndex).padStart(2, "0");

    return {
      groupKey: group.key,
      groupLabel: group.label,
      dir: group.dir,
      index: safeIndex,
      indexLabel,
      label: `${group.label} ${indexLabel}`,
      src: `templates/fuda/${group.dir}/fuda_${group.dir}_${indexLabel}.png`
    };
  }

  selectTemplate(groupKey, index) {
    this.editorState.templateGroup = groupKey;
    this.editorState.templateIndex = index;
    this.updateTemplateButtons();
    this.loadCurrentTemplate();
  }

  updateTemplateButtons() {
    document.querySelectorAll(".template-btn").forEach((button) => {
      const isActive =
        button.dataset.group === this.editorState.templateGroup &&
        Number(button.dataset.index) === this.editorState.templateIndex;
      button.classList.toggle("active", isActive);
    });
  }

  loadCurrentTemplate() {
    const template = this.getTemplateConfig(this.editorState.templateGroup, this.editorState.templateIndex);
    const image = new Image();

    this.showLoading();
    this.hideError();

    image.onload = () => {
      this.templateImage = image;
      this.templateMeta = {
        width: image.naturalWidth,
        height: image.naturalHeight,
        label: template.label,
        dir: template.dir,
        indexLabel: template.indexLabel
      };

      this.canvas.width = image.naturalWidth;
      this.canvas.height = image.naturalHeight;
      this.updateTemplateSummary();
      this.hideLoading();
      this.draw();
    };

    image.onerror = () => {
      this.hideLoading();
      this.showError();
    };

    image.src = template.src;
  }

  updateTemplateSummary() {
    this.dom.currentTemplateLabel.textContent = this.templateMeta.label;
    this.dom.currentTemplateMeta.textContent = `${this.templateMeta.width} x ${this.templateMeta.height}`;
  }

  updateTextNumeric(layerKey, key, rawValue, minValue = null) {
    const nextValue = Number(rawValue);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    this.editorState[layerKey][key] = minValue === null ? nextValue : Math.max(minValue, nextValue);
    this.syncTextInputs(layerKey);
    this.draw();
  }

  syncTextInputs(layerKey) {
    this.dom[`${layerKey}Input`].value = this.editorState[layerKey].value;
    const fontSizeInput = this.dom[`${layerKey}FontSizeInput`];
    if (fontSizeInput) {
      fontSizeInput.value = Math.round(this.editorState[layerKey].fontSize);
    }
  }

  syncAllInputs() {
    this.syncTextInputs("name");
    this.syncTextInputs("uid");
  }

  draw() {
    if (!this.templateImage.complete) {
      this.updateCoordsDisplay();
      return;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.templateImage, 0, 0, this.canvas.width, this.canvas.height);

    this.drawTextLayer("name");
    this.drawTextLayer("uid");

    this.updateCoordsDisplay();
  }

  drawTextLayer(layerKey) {
    const layer = this.editorState[layerKey];
    const style = this.textStyles[layer.styleKey];
    const displayValue = this.getDisplayValue(layerKey);
    const isPlaceholder = layer.value.trim().length === 0;
    const gradient = this.createGradient(layer.y - layer.fontSize, layer.y);
    const highlightGradient = this.ctx.createLinearGradient(0, layer.y - layer.fontSize, 0, layer.y);
    highlightGradient.addColorStop(0, "rgba(255, 252, 244, 0.98)");
    highlightGradient.addColorStop(0.42, "rgba(255, 236, 196, 0.82)");
    highlightGradient.addColorStop(1, "rgba(255, 210, 137, 0.22)");

    this.ctx.save();
    this.ctx.font = `${layer.fontSize}px ${style.fontFamily}, sans-serif`;
    this.ctx.textAlign = layer.anchor === "baseline-center" ? "center" : "left";
    this.ctx.textBaseline = "alphabetic";

    if (style.glow === "soft-gold") {
      this.ctx.fillStyle = gradient;
      this.ctx.globalAlpha = isPlaceholder ? 0.48 : 1;
      this.ctx.shadowBlur = Math.max(22, layer.fontSize * 0.5);
      this.ctx.shadowColor = "rgba(255, 224, 168, 0.96)";
      this.ctx.fillText(displayValue, layer.x, layer.y);

      this.ctx.globalAlpha = isPlaceholder ? 0.54 : 0.96;
      this.ctx.shadowBlur = Math.max(10, layer.fontSize * 0.24);
      this.ctx.shadowColor = "rgba(255, 191, 118, 0.72)";
      this.ctx.fillText(displayValue, layer.x, layer.y);
    }

    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = isPlaceholder ? 0.62 : 1;
    this.ctx.fillStyle = gradient;
    this.ctx.fillText(displayValue, layer.x, layer.y);

    if (style.glow === "soft-gold") {
      this.ctx.globalAlpha = isPlaceholder ? 0.28 : 0.64;
      this.ctx.fillStyle = highlightGradient;
      this.ctx.shadowBlur = Math.max(4, layer.fontSize * 0.08);
      this.ctx.shadowColor = "rgba(255, 246, 224, 0.68)";
      this.ctx.fillText(displayValue, layer.x, layer.y);
    }

    this.ctx.restore();
  }

  getDisplayValue(layerKey) {
    const layer = this.editorState[layerKey];
    return layer.value.trim();
  }

  createGradient(startY, endY) {
    const gradient = this.ctx.createLinearGradient(0, startY, 0, endY);
    this.gradientStops.forEach((stop) => {
      gradient.addColorStop(stop.offset, stop.color);
    });
    return gradient;
  }

  updateCoordsDisplay() {
    const name = this.editorState.name;
    const uid = this.editorState.uid;
    const nameStatus = name.value.trim().length > 0 ? "已输入" : "未输入";
    const uidStatus = uid.value.trim().length > 0 ? "已输入" : "未输入";

    this.dom.coordsDisplay.innerHTML = `
      <div class="coord-item coord-item-wide">
        <span>模板</span>
        <strong>${this.templateMeta.label}</strong>
        <small>${this.templateMeta.width} x ${this.templateMeta.height} · 预览缩小显示，导出保持原始大小</small>
      </div>
      <div class="coord-item">
        <span>姓名</span>
        <strong>${nameStatus}</strong>
        <small>字号 ${Math.round(name.fontSize)} · 固定居中输出</small>
      </div>
      <div class="coord-item">
        <span>UID</span>
        <strong>${uidStatus}</strong>
        <small>固定位置与固定字号输出</small>
      </div>
    `;
  }

  showLoading() {
    this.dom.loadingOverlay.classList.remove("hidden");
  }

  hideLoading() {
    this.dom.loadingOverlay.classList.add("hidden");
  }

  showError() {
    this.dom.errorOverlay.classList.remove("hidden");
  }

  hideError() {
    this.dom.errorOverlay.classList.add("hidden");
  }

  downloadCertificate() {
    if (!this.templateImage.complete) {
      return;
    }

    const link = document.createElement("a");
    link.download = `富达证书_${this.templateMeta.dir}_${this.templateMeta.indexLabel}.png`;
    link.href = this.canvas.toDataURL("image/png");
    link.click();
  }

  async copyCertificate() {
    if (!window.ClipboardItem || !navigator.clipboard) {
      window.alert("当前浏览器不支持复制图片，请使用下载 PNG。");
      return;
    }

    this.canvas.toBlob(async (blob) => {
      if (!blob) {
        window.alert("复制失败，请尝试重新下载。");
        return;
      }

      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": blob
          })
        ]);

        this.flashActionButton(this.dom.copyBtn, "已复制");
      } catch (error) {
        console.error("复制图片失败：", error);
        window.alert("复制失败，请使用下载 PNG。");
      }
    }, "image/png");
  }

  flashActionButton(button, text) {
    const label = button.querySelector("span");
    const previousText = label.textContent;
    label.textContent = text;
    button.style.borderColor = "rgba(254, 212, 145, 0.5)";
    button.style.background = "rgba(254, 212, 145, 0.18)";

    window.setTimeout(() => {
      label.textContent = previousText;
      button.style.borderColor = "";
      button.style.background = "";
    }, 1800);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const editor = new FudaCertificateEditor();
  editor.init();
});
