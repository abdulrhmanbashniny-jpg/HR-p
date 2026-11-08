/**
 * Claude Design Component Runtime (support.js)
 * Implements DCLogic, <sc-for>, <sc-if>, reactive state, and template interpolation.
 */

(function () {
  'use strict';

  // 1. DCLogic Base Class
  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
      this._rerender = null;
    }

    setState(partial, callback) {
      if (typeof partial === 'function') {
        this.state = Object.assign({}, this.state, partial(this.state, this.props));
      } else {
        this.state = Object.assign({}, this.state, partial);
      }
      if (typeof this._rerender === 'function') {
        this._rerender();
      }
      if (typeof callback === 'function') {
        callback();
      }
    }

    renderVals() {
      return {};
    }
  }

  window.DCLogic = DCLogic;

  // 2. Safe Expression Evaluator
  const exprCache = new Map();

  function evalExpr(expr, scope) {
    if (!expr) return '';
    const clean = expr.trim();
    if (!clean) return '';

    let fn = exprCache.get(clean);
    if (!fn) {
      try {
        fn = new Function('scope', `with(scope) { return (${clean}); }`);
        exprCache.set(clean, fn);
      } catch (err) {
        return '';
      }
    }

    try {
      return fn(scope);
    } catch (err) {
      return '';
    }
  }

  // 3. Compile & Render Nodes recursively
  function compileNode(node, scope, instance) {
    // A. Text Node
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (text.includes('{{')) {
        const interpolated = text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, exp) => {
          const val = evalExpr(exp, scope);
          return val !== undefined && val !== null ? val : '';
        });
        return document.createTextNode(interpolated);
      }
      return node.cloneNode(false);
    }

    // B. Element Node
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();

      // <sc-for list="{{...}}" as="...">
      if (tagName === 'sc-for') {
        const listAttr = node.getAttribute('list') || '';
        const asVar = node.getAttribute('as') || 'item';
        const cleanListExpr = listAttr.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
        const listVal = evalExpr(cleanListExpr, scope);

        const frag = document.createDocumentFragment();
        if (Array.isArray(listVal)) {
          listVal.forEach((item, idx) => {
            const itemScope = Object.assign(Object.create(scope), {
              [asVar]: item,
              [asVar + '_index']: idx,
              index: idx
            });
            Array.from(node.childNodes).forEach(child => {
              const renderedChild = compileNode(child, itemScope, instance);
              if (renderedChild) frag.appendChild(renderedChild);
            });
          });
        }
        return frag;
      }

      // <sc-if value="{{...}}">
      if (tagName === 'sc-if') {
        const valAttr = node.getAttribute('value') || node.getAttribute('test') || '';
        const cleanValExpr = valAttr.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
        const cond = evalExpr(cleanValExpr, scope);

        if (cond && cond !== 'false') {
          const frag = document.createDocumentFragment();
          Array.from(node.childNodes).forEach(child => {
            const renderedChild = compileNode(child, scope, instance);
            if (renderedChild) frag.appendChild(renderedChild);
          });
          return frag;
        }
        return null;
      }

      // Regular DOM Element
      const el = document.createElement(node.tagName);

      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        const attrName = attr.name;
        const attrVal = attr.value;

        // Event handler: onClick="{{...}}" or onclick="..."
        if (/^on[a-z]+/i.test(attrName)) {
          const eventType = attrName.slice(2).toLowerCase();
          const cleanExpr = attrVal.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
          const handler = evalExpr(cleanExpr, scope);

          if (typeof handler === 'function') {
            el.addEventListener(eventType, function (e) {
              if (el.tagName === 'BUTTON' || el.getAttribute('href') === '#') {
                e.preventDefault();
              }
              handler.call(instance, e);
            });
          }
          continue;
        }

        // Interpolated Attributes
        if (attrVal.includes('{{')) {
          // Exact single expression e.g. checked="{{true}}"
          const singleMatch = attrVal.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
          if (singleMatch) {
            const val = evalExpr(singleMatch[1], scope);
            if (typeof val === 'boolean') {
              if (val) {
                el.setAttribute(attrName, '');
                if (attrName in el) el[attrName] = true;
              } else {
                el.removeAttribute(attrName);
                if (attrName in el) el[attrName] = false;
              }
            } else if (val !== undefined && val !== null) {
              const strVal = String(val);
              el.setAttribute(attrName, strVal);
              if (attrName === 'value' && ('value' in el)) {
                el.value = strVal;
              }
              if (attrName === 'style') {
                el.style.cssText = strVal;
              }
            }
          } else {
            const interpolated = attrVal.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, exp) => {
              const val = evalExpr(exp, scope);
              return val !== undefined && val !== null ? val : '';
            });
            el.setAttribute(attrName, interpolated);
            if (attrName === 'style') {
              el.style.cssText = interpolated;
            }
          }
        } else {
          el.setAttribute(attrName, attrVal);
          if (attrName === 'value' && ('value' in el)) {
            el.value = attrVal;
          }
        }
      }

      // Render children recursively
      Array.from(node.childNodes).forEach(child => {
        const renderedChild = compileNode(child, scope, instance);
        if (renderedChild) el.appendChild(renderedChild);
      });

      return el;
    }

    return null;
  }

  // 4. Mount and Boot Runtime
  function initDC() {
    const xdc = document.querySelector('x-dc');
    const script = document.querySelector('script[data-dc-script]');

    if (!xdc) return;

    // Move <helmet> contents to <head>
    const helmet = xdc.querySelector('helmet');
    if (helmet) {
      Array.from(helmet.children).forEach(child => {
        document.head.appendChild(child.cloneNode(true));
      });
      helmet.remove();
    }

    // Save pristine template DOM clone
    const templateRoot = xdc.cloneNode(true);
    xdc.innerHTML = '';

    let instance = null;
    let CompClass = null;

    if (script) {
      let props = {};
      try {
        props = JSON.parse(script.getAttribute('data-props') || '{}');
      } catch (e) { }

      try {
        const scriptCode = script.textContent;
        const factory = new Function('DCLogic', scriptCode + '\nreturn typeof Component !== "undefined" ? Component : null;');
        CompClass = factory(DCLogic);
      } catch (err) {
        console.error('[DC Runtime] Failed to compile Component:', err);
      }

      if (CompClass) {
        instance = new CompClass(props);
      }
    }

    if (!instance) {
      instance = new DCLogic({});
    }

    // Render loop
    function render() {
      const vals = instance.renderVals() || {};
      const scope = Object.assign({}, vals, {
        state: instance.state,
        props: instance.props
      });

      const frag = document.createDocumentFragment();
      Array.from(templateRoot.childNodes).forEach(child => {
        const rendered = compileNode(child, scope, instance);
        if (rendered) frag.appendChild(rendered);
      });

      xdc.innerHTML = '';
      xdc.appendChild(frag);
    }

    instance._rerender = render;
    render();

    // Lifecycle hook for dynamic initialization (e.g., fetching real API data)
    if (typeof instance.mounted === 'function') {
      try {
        instance.mounted();
      } catch (err) {
        console.error('[DC Runtime] Error in instance.mounted():', err);
      }
    }

    // Production mode — no demo toolbar
  }

  // 5. Floating Navigation Toolbar
  function attachPlatformToolbar() {
    if (document.getElementById('dc-platform-toolbar')) return;

    const screens = [
      { name: '🗺️ خريطة اللوحة الكاملة (Canvas Overview)', url: 'index.html' },
      { category: 'رحلة المتقدم' },
      { name: '١ — الرئيسية والوظائف', url: 'Main.dc.html' },
      { name: '٢ — تفاصيل الوظيفة', url: 'Job.dc.html' },
      { name: '٣ — نموذج التقديم', url: 'Apply.dc.html' },
      { name: '٤ — اختبار الجدارة (10 أسئلة)', url: 'Assessment.dc.html' },
      { name: '٥أ — نتيجة الاجتياز (≥ 60%)', url: 'ResultPass.dc.html' },
      { name: '٥ب — نتيجة الاعتذار (< 60%)', url: 'ResultFail.dc.html' },
      { category: 'لوحة التحكم واللجنة' },
      { name: '٦ — لوحة التحكم ونظرة عامة', url: 'Dashboard.dc.html' },
      { name: '٧ — ملف المرشح وتقييم اللجنة', url: 'CandidateProfile.dc.html' },
      { name: '٨ — ترتيب المرشحين والبوديوم', url: 'Ranking.dc.html' },
      { name: '٩ — رسائل ومقابلات واتساب', url: 'Interviews.dc.html' },
      { name: '١٠ — إعداد الوظيفة وبرومبت AI', url: 'JobBuilder.dc.html' },
      { name: '١١ — البنية التقنية (Architecture)', url: 'System.dc.html' },
      { category: 'الذكاء الاصطناعي والجدولة' },
      { name: '١٢ — محرك التحليل بالذكاء الاصطناعي', url: 'AIEngine.dc.html' },
      { name: '١٣ — جدولة المواعيد التلقائية', url: 'Scheduler.dc.html' },
      { name: '١٤ — الإعدادات والتكاملات', url: 'Settings.dc.html' }
    ];

    const currentUrl = window.location.pathname.split('/').pop() || 'index.html';

    const bar = document.createElement('div');
    bar.id = 'dc-platform-toolbar';
    bar.setAttribute('dir', 'rtl');
    bar.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(23, 25, 28, 0.94);
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 999px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif;
      font-size: 13px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.15);
      transition: all 0.25s ease;
    `;

    // Dropdown for screens
    let optionsHtml = '';
    screens.forEach(s => {
      if (s.category) {
        optionsHtml += `<optgroup label="── ${s.category} ──"></optgroup>`;
      } else {
        const isSelected = currentUrl === s.url ? 'selected' : '';
        optionsHtml += `<option value="${s.url}" ${isSelected}>${s.name}</option>`;
      }
    });

    bar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display: flex; gap: 3px; align-items: flex-end;">
          <span style="width: 5px; height: 16px; background: #C8553D; border-radius: 2px;"></span>
          <span style="width: 5px; height: 20px; background: #E0A21B; border-radius: 2px;"></span>
          <span style="width: 5px; height: 13px; background: #2F5D50; border-radius: 2px;"></span>
        </span>
        <span style="font-weight: 700; font-size: 13px; color: #F2C14E;">منصة الدهانات</span>
      </div>
      <select id="dc-screen-select" style="
        background: #2A2D31;
        color: #FFFFFF;
        border: 1px solid #44474E;
        border-radius: 8px;
        padding: 5px 10px;
        font: inherit;
        font-size: 12.5px;
        cursor: pointer;
        outline: none;
      ">
        ${optionsHtml}
      </select>
      <button id="dc-fit-toggle" title="ملاءمة الشاشة تلقائياً" style="
        background: #2A2D31;
        color: #FFFFFF;
        border: 1px solid #44474E;
        border-radius: 8px;
        padding: 5px 10px;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      ">ملاءمة العرض</button>
      <a href="index.html" style="
        background: #C8553D;
        color: #FFFFFF;
        text-decoration: none;
        padding: 5px 12px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
      ">اللوحة الكاملة 🗺️</a>
    `;

    document.body.appendChild(bar);

    const select = document.getElementById('dc-screen-select');
    if (select) {
      select.addEventListener('change', function () {
        if (this.value) {
          window.location.href = this.value;
        }
      });
    }

    // Auto-fit / scale handler
    const fitBtn = document.getElementById('dc-fit-toggle');
    let isFitted = false;
    if (fitBtn) {
      fitBtn.addEventListener('click', function () {
        const rootDiv = document.querySelector('x-dc > div');
        if (!rootDiv) return;

        if (!isFitted) {
          const winW = window.innerWidth;
          const targetW = 1440;
          if (winW < targetW) {
            const scale = Math.min(1, (winW - 20) / targetW);
            rootDiv.style.transformOrigin = 'top center';
            rootDiv.style.transform = `scale(${scale})`;
            rootDiv.style.margin = '0 auto';
            document.body.style.overflowX = 'hidden';
            fitBtn.style.background = '#2F5D50';
            fitBtn.textContent = 'المقاس الطبيعي (100%)';
            isFitted = true;
          }
        } else {
          rootDiv.style.transform = 'none';
          document.body.style.overflowX = 'auto';
          fitBtn.style.background = '#2A2D31';
          fitBtn.textContent = 'ملاءمة العرض';
          isFitted = false;
        }
      });
    }

    // If screen is narrow on mobile/tablet, offer fit automatically
    if (window.innerWidth < 1440 && fitBtn) {
      setTimeout(() => fitBtn.click(), 100);
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDC);
  } else {
    initDC();
  }
})();
