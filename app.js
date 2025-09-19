(() => {
  const hasBarcodeAPI = 'BarcodeDetector' in window;
  const supportedFormatsDefault = [
    'aztec','code_128','code_39','code_93','codabar',
    'data_matrix','ean_13','ean_8','itf','pdf417',
    'qr_code','upc_a','upc_e'
  ];

  const els = {
    video: document.getElementById('video'),
    overlay: document.getElementById('overlay'),
    cameraSelect: document.getElementById('cameraSelect'),
    btnStart: document.getElementById('btnStart'),
    btnStop: document.getElementById('btnStop'),
    btnClear: document.getElementById('btnClear'),
    btnCopyAll: document.getElementById('btnCopyAll'),
    toggleTorch: document.getElementById('toggleTorch'),
    fileInput: document.getElementById('fileInput'),
    results: document.getElementById('results'),
    count: document.getElementById('count'),
    apiBadge: document.getElementById('apiBadge'),
    fps: document.getElementById('fps'),
    lastType: document.getElementById('lastType'),
    beep: document.getElementById('beep'),
    compat: document.getElementById('compat')
  };

  let detector = null;
  let stream = null;
  let track = null;
  let running = false;
  let lastTime = performance.now();
  let frames = 0;
  let fps = 0;
  const seen = new Set();

  const ctx = els.overlay.getContext('2d');

  function setBadge() {
    if (hasBarcodeAPI) {
      window.BarcodeDetector.getSupportedFormats?.().then(list => {
        const sup = (list && list.length ? list : supportedFormatsDefault).join(', ');
        els.apiBadge.innerHTML = `API: <strong>nativa</strong> · <span class="subtle">Formatos: ${sup}</span>`;
      }).catch(() => {
        els.apiBadge.innerHTML = `API: <strong>nativa</strong>`;
      });
    } else {
      els.apiBadge.innerHTML = `API: <strong>no disponible</strong>`;
      els.compat.textContent = ' Tu navegador no soporta BarcodeDetector. Puedes cargar imágenes o usar otro navegador.';
    }
  }

  async function enumerateCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(d => d.kind === 'videoinput');
    els.cameraSelect.innerHTML = '';
    videos.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Cámara ${i+1}`;
      els.cameraSelect.appendChild(opt);
    });
    if (!videos.length) {
      const opt = document.createElement('option');
      opt.textContent = 'No hay cámaras';
      els.cameraSelect.appendChild(opt);
    }
  }

  async function start() {
    if (running) return;
    try {
      const constraints = {
        audio: false,
        video: {
          deviceId: els.cameraSelect.value ? { exact: els.cameraSelect.value } : undefined,
          facingMode: 'environment',
          width: { ideal: 1280 }, height: { ideal: 720 }
        }
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      els.video.srcObject = stream;
      track = stream.getVideoTracks()[0];

      await els.video.play();
      resizeCanvas();
      running = true;
      els.btnStart.disabled = true;
      els.btnStop.disabled = false;

      if (hasBarcodeAPI) {
        const formats = await window.BarcodeDetector.getSupportedFormats?.()
          .catch(() => supportedFormatsDefault) || supportedFormatsDefault;
        detector = new window.BarcodeDetector({ formats });
      } else {
        detector = null;
      }

      requestAnimationFrame(loop);
      tryToggleTorch(true);
    } catch (err) {
      console.error(err);
      alert('No se pudo iniciar la cámara: ' + (err.message || err));
    }
  }

  function stop() {
    running = false;
    els.btnStart.disabled = false;
    els.btnStop.disabled = true;
    if (track) { track.stop(); track = null; }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    clearOverlay();
  }

  function resizeCanvas() {
    const rect = els.video.getBoundingClientRect();
    els.overlay.width = rect.width * devicePixelRatio;
    els.overlay.height = rect.height * devicePixelRatio;
  }
  window.addEventListener('resize', resizeCanvas);

  function clearOverlay() {
    ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
  }

  function drawBoxes(barcodes) {
    clearOverlay();
    ctx.lineWidth = 3 * devicePixelRatio;
    ctx.strokeStyle = 'rgba(96,165,250,0.95)';
    ctx.fillStyle = 'rgba(96,165,250,0.15)';
    for (const b of barcodes) {
      if (!b.boundingBox) continue;

      const vw = els.video.videoWidth, vh = els.video.videoHeight;
      const cw = els.overlay.width, ch = els.overlay.height;
      const vidRatio = vw / vh;
      const box = b.boundingBox;

      const canvasRatio = cw / ch;
      let drawW, drawH, offsetX=0, offsetY=0;
      if (vidRatio > canvasRatio) {
        drawH = ch; drawW = ch * vidRatio; offsetX = (cw - drawW) / 2;
      } else {
        drawW = cw; drawH = cw / vidRatio; offsetY = (ch - drawH) / 2;
      }
      const scaleX = drawW / vw; const scaleY = drawH / vh;

      const x = offsetX + box.x * scaleX;
      const y = offsetY + box.y * scaleY;
      const w = box.width * scaleX;
      const h = box.height * scaleY;

      // etiqueta: definir fuente antes de medir
      const label = b.format?.toUpperCase() || 'CODE';
      ctx.font = `${14 * devicePixelRatio}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      const textW = ctx.measureText(label).width;

      ctx.strokeRect(x, y, w, h);
      ctx.fillRect(x, y - 28, textW + 24, 24);

      ctx.fillStyle = '#0b1224';
      ctx.fillText(label, x + 8, y - 10);
      ctx.fillStyle = 'rgba(96,165,250,0.15)';
    }
  }

  async function loop(now) {
    if (!running) return;

    frames++;
    if (now - lastTime >= 1000) {
      fps = frames; frames = 0; lastTime = now;
      els.fps.textContent = String(fps);
    }

    if (detector) {
      try {
        const barcodes = await detector.detect(els.video);
        if (barcodes.length) {
          drawBoxes(barcodes);
          for (const b of barcodes) onDetect(b);
        } else {
          clearOverlay();
        }
      } catch (err) {
        console.warn('Detector error:', err);
      }
    }
    requestAnimationFrame(loop);
  }

  function onDetect(b) {
    const raw = (b.rawValue || '').trim();
    if (!raw || seen.has(raw)) return;
    seen.add(raw);

    try { els.beep.currentTime = 0; els.beep.play().catch(()=>{}); } catch {}
    els.lastType.textContent = b.format || '—';
    addResult({
      value: raw,
      format: b.format || 'desconocido',
      ts: new Date()
    });
  }

  function addResult({ value, format, ts }) {
    const div = document.createElement('div');
    div.className = 'item';

    const code = document.createElement('div');
    code.className = 'code';
    code.textContent = value;

    const row = document.createElement('div');
    row.className = 'row';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const d = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' }).format(ts);
    meta.innerHTML = `<span>Formato: <strong>${format}</strong></span><span>${d}</span>`;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const copy = document.createElement('button');
    copy.textContent = '📋 Copiar';
    copy.onclick = async () => {
      await navigator.clipboard.writeText(value);
      copy.textContent = '✅ Copiado';
      setTimeout(()=> copy.textContent='📋 Copiar', 1200);
    };

    const remove = document.createElement('button');
    remove.textContent = '✖ Quitar';
    remove.classList.add('danger');
    remove.onclick = () => {
      seen.delete(value);
      div.remove();
      updateCount();
    };

    actions.appendChild(copy);
    actions.appendChild(remove);

    row.appendChild(meta);
    row.appendChild(actions);

    div.appendChild(code);
    div.appendChild(row);
    els.results.prepend(div);
    updateCount();
  }

  function updateCount() {
    els.count.textContent = `${els.results.children.length} encontrados`;
  }

  async function tryToggleTorch(respectSwitch=false) {
    if (!track) return;
    const want = els.toggleTorch.checked; // simplificado
    try {
      await track.applyConstraints({ advanced: [{ torch: want }] });
    } catch {
      if (!respectSwitch) {
        document.querySelector('.switch')?.classList.add('hidden');
      }
    }
  }

  // Leer desde imagen
  els.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!hasBarcodeAPI) {
      alert('Tu navegador no soporta la lectura nativa. Prueba en Chrome/Edge recientes o usa la cámara.');
      return;
    }
    const img = new Image();
    img.onload = async () => {
      try {
        const d = await detector.detect(img);
        if (d.length) {
          for (const b of d) onDetect(b);
        } else {
          alert('No se detectaron códigos en la imagen.');
        }
      } catch (err) {
        alert('Error al analizar la imagen: ' + (err.message || err));
      }
    };
    img.src = URL.createObjectURL(file);
  });

  // Botones
  els.btnStart.addEventListener('click', start);
  els.btnStop.addEventListener('click', stop);
  els.btnClear.addEventListener('click', () => {
    seen.clear();
    els.results.innerHTML = '';
    updateCount();
  });
  els.btnCopyAll.addEventListener('click', async () => {
    const all = Array.from(els.results.querySelectorAll('.code')).map(x => x.textContent).join('\n');
    if (!all) return;
    await navigator.clipboard.writeText(all);
    els.btnCopyAll.textContent = '✅ Copiado';
    setTimeout(()=> els.btnCopyAll.textContent='📋 Copiar todo', 1200);
  });
  els.toggleTorch.addEventListener('change', () => tryToggleTorch(true));

  // Inicialización
  (async function init() {
    setBadge();
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Este navegador no soporta cámara (getUserMedia).');
      return;
    }
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      tmp.getTracks().forEach(t => t.stop());
    } catch {}
    await enumerateCameras();
  })();
  const els = {
  // ...los que ya tienes...
  offers: document.getElementById('offers'),
  offersStatus: document.getElementById('offersStatus'),
  manualQuery: document.getElementById('manualQuery'),
  btnSearch: document.getElementById('btnSearch')
};
function renderOffers(off) {
  els.offers.innerHTML = '';
  if (!off || !off.length) {
    els.offersStatus.textContent = 'No encontré ofertas (prueba con otro término).';
    return;
  }
  els.offersStatus.textContent = `${off.length} ofertas encontradas`;
  for (const o of off) {
    const div = document.createElement('div');
    div.className = 'offer';
    const top = document.createElement('div');
    top.className = 'row';
    const left = document.createElement('div');
    left.innerHTML = `<div><strong>${o.merchant || 'Tienda'}</strong></div>
                      <div>${o.title || ''}</div>`;
    const right = document.createElement('div');
    right.innerHTML = `<div class="price">${o.maybePrice ? o.maybePrice : ''}</div>`;
    top.appendChild(left); top.appendChild(right);

    const why = document.createElement('div');
    why.className = 'subtle';
    why.textContent = o.why || '';

    const link = document.createElement('a');
    link.href = o.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Ver tienda →';

    div.appendChild(top);
    if (o.why) div.appendChild(why);
    div.appendChild(link);
    els.offers.appendChild(div);
  }
}

async function findOffers({ barcode, query }) {
  try {
    els.offersStatus.textContent = 'Buscando…';
    const resp = await fetch('http://localhost:5174/api/find-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode, query })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || 'Error de búsqueda');
    renderOffers(data.offers);
  } catch (err) {
    console.error(err);
    els.offersStatus.textContent = `Error: ${err.message || err}`;
  }
}
function onDetect(b) {
  const raw = (b.rawValue || '').trim();
  if (!raw || seen.has(raw)) return;
  seen.add(raw);

  try { els.beep.currentTime = 0; els.beep.play().catch(()=>{}); } catch {}
  els.lastType.textContent = b.format || '—';
  addResult({ value: raw, format: b.format || 'desconocido', ts: new Date() });

  // ⬇️ NUEVO: lanzar búsqueda con el código de barras
  findOffers({ barcode: raw });
}
els.btnSearch.addEventListener('click', () => {
  const q = (els.manualQuery.value || '').trim();
  if (!q) return;
  findOffers({ query: q });
});

})();
