/**
 * GlassBG — Core Application Configuration & Script
 */

// 1. KONFIGURASI ENGINE API (Mudah Diganti)
const ENGINE_CONFIG = {
    // Mode saat ini: 'local' (menggunakan Wasm SDK client side) atau 'api' (cloud server external)
    currentEngine: 'local', 
    
    // Konfigurasi jika Anda ingin mengubahnya ke API Eksternal di kemudian hari
    apiEndpoint: 'https://api.remove.bg/v1.0/removebg',
    apiKey: 'YOUR_EXTERNAL_API_KEY' 
};

// 2. STATE APLIKASI
let appState = {
    originalFile: null,
    originalImageElement: null,
    processedBlob: null,
    processedImageElement: null,
    currentScale: 1,
    historyStack: [], // Untuk fitur Undo
    activeBgType: 'transparent', // transparent, color, image
    bgValue: 'transparent',
    blurRadius: 0,
    featherSize: 0,
    shadowIntensity: 0,
    autoCrop: true
};

// 3. ELEMEN DOM
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const editorView = document.getElementById('editorView');
const controlPanel = document.getElementById('controlPanel');
const imgBefore = document.getElementById('imgBefore');
const mainCanvas = document.getElementById('mainCanvas');
const ctx = mainCanvas.getContext('2d');
const imageSlider = document.getElementById('imageSlider');
const sliderHandle = imageSlider.querySelector('.slider-handle');
const imgBeforeContainer = imageSlider.querySelector('.image-before');

// 4. EVENT LISTENERS UTAMA
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupDropzone();
    setupControls();
    setupSlider();
});

// Theme Management
function initTheme() {
    const btn = document.getElementById('themeToggle');
    btn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        btn.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });
}

// Drag & Drop Setup
function setupDropzone() {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileSelect(e.target.files[0]);
    });
}

// Validation & Process Start
function handleFileSelect(file) {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        showToast('Format file tidak didukung! Gunakan PNG, JPG, atau WebP.', 'danger');
        return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB
        showToast('Ukuran file terlalu besar! Maksimal 10MB.', 'danger');
        return;
    }

    appState.originalFile = file;
    
    // Buat Preview Gambar Original ("Before")
    const reader = new FileReader();
    reader.onload = (e) => {
        imgBefore.src = e.target.result;
        appState.originalImageElement = new Image();
        appState.originalImageElement.src = e.target.result;
        appState.originalImageElement.onload = () => {
            // Sembunyikan dropzone, munculkan editor panel
            dropzone.classList.add('hidden');
            editorView.classList.remove('hidden');
            controlPanel.classList.remove('locked');
            
            // Jalankan AI Core Processor
            processImageWithAI();
        };
    };
    reader.readAsDataURL(file);
}

// 5. CORE AI PROCESSING ENGINE
async function processImageWithAI() {
    showLoader(true, 'Mengunduh AI Model lokal (hanya sekali)...');
    updateProgress(10);

    if (ENGINE_CONFIG.currentEngine === 'local') {
        try {
            // Memanggil Lib imgly Client-Side WASM
            updateProgress(30);
            const imageBlob = await imglyRemoveBackground(appState.originalFile, {
                progress: (step) => {
                    // Berikan update status progress proses AI
                    const percentage = Math.round(30 + (step * 60));
                    updateProgress(percentage, `Langkah AI: ${Math.round(step * 100)}%`);
                }
            });

            updateProgress(95, 'Merender hasil akhir...');
            appState.processedBlob = imageBlob;
            
            // Konversi hasil blob ke Image Element untuk manipulasi canvas
            const url = URL.createObjectURL(imageBlob);
            appState.processedImageElement = new Image();
            appState.processedImageElement.src = url;
            appState.processedImageElement.onload = () => {
                saveToHistory();
                renderCanvas();
                showLoader(false);
                showToast('Hore! Background berhasil dihapus.', 'success');
            };

        } catch (error) {
            console.error(error);
            showLoader(false);
            showToast('Gagal memproses gambar secara lokal.', 'danger');
        }
    } else {
        // OPERASI CLOUD API MENGGUNAKAN API KEY JIKA DI-SET
        // Integrasi Remove.bg / API Cloud lainnya bisa ditaruh disini dengan Fetch request
        showToast('Metode API eksternal belum dikonfigurasi.', 'danger');
        showLoader(false);
    }
}

// 6. CANVAS RENDERING ENGINE (Manipulasi Efek & Background)
function renderCanvas() {
    if (!appState.processedImageElement) return;

    const img = appState.processedImageElement;
    let width = img.width;
    let height = img.height;

    // Set Resolusi Canvas Utama
    mainCanvas.width = width;
    mainCanvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.save();

    // Jalankan efek Feather (Smoothing Tepi) jika diatur
    if (appState.featherSize > 0) {
        ctx.filter = `blur(${appState.featherSize}px)`;
    }

    // Menggambar Lapisan Latar Belakang (Background Layer)
    if (appState.activeBgType === 'color') {
        ctx.fillStyle = appState.bgValue;
        ctx.fillRect(0, 0, width, height);
    } else if (appState.activeBgType === 'image' && appState.bgValue instanceof HTMLImageElement) {
        if (appState.blurRadius > 0) ctx.filter = `blur(${appState.blurRadius}px)`;
        ctx.drawImage(appState.bgValue, 0, 0, width, height);
        ctx.filter = 'none'; // reset filter
    }

    // Menggambar Efek Bayangan (Object Drop Shadow)
    if (appState.shadowIntensity > 0) {
        ctx.shadowColor = "rgba(0, 0, 0, " + (appState.shadowIntensity / 100) + ")";
        ctx.shadowBlur = 30;
        ctx.shadowOffsetX = 10;
        ctx.shadowOffsetY = 15;
    }

    // Menggambar Objek Utama yang sudah transparan
    ctx.drawImage(img, 0, 0, width, height);
    ctx.restore();

    // Sinkronkan ukuran slider
    resetSliderPosition();
}

// 7. KONTROL & EVENT HANDLER PANEL
function setupControls() {
    // Tab Background Switcher
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tab = btn.dataset.tab;
            appState.activeBgType = tab;
            
            // Sembunyikan / Tampilkan panel sub-tab
            document.getElementById('tabContentColor').classList.toggle('hidden', tab !== 'color');
            document.getElementById('tabContentImage').classList.toggle('hidden', tab !== 'image');

            if (tab === 'transparent') appState.bgValue = 'transparent';
            renderCanvas();
        });
    });

    // Color Swatch Event
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            appState.bgValue = swatch.dataset.color;
            renderCanvas();
        });
    });
    document.getElementById('customColorPicker').addEventListener('input', (e) => {
        appState.bgValue = e.target.value;
        renderCanvas();
    });

    // Upload Custom Background Image
    document.getElementById('bgImageInput').addEventListener('change', (e) => {
        if (e.target.files.length) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                const bgImg = new Image();
                bgImg.src = event.target.result;
                bgImg.onload = () => {
                    appState.bgValue = bgImg;
                    renderCanvas();
                };
            };
            reader.readAsDataURL(file);
        }
    });

    // Slider range penyesuaian parameter efek
    document.getElementById('inputBlur').addEventListener('input', (e) => {
        appState.blurRadius = e.target.value;
        document.getElementById('blurVal').innerText = `${e.target.value}px`;
        renderCanvas();
    });
    document.getElementById('inputFeather').addEventListener('input', (e) => {
        appState.featherSize = e.target.value;
        document.getElementById('featherVal').innerText = `${e.target.value}px`;
        renderCanvas();
    });
    document.getElementById('inputShadow').addEventListener('input', (e) => {
        appState.shadowIntensity = e.target.value;
        document.getElementById('shadowVal').innerText = `${e.target.value}%`;
        renderCanvas();
    });

    // Tombol Reset Aplikasi
    document.getElementById('btnReset').addEventListener('click', () => {
        location.reload(); // Sederhana & Membersihkan memori browser sepenuhnya
    });

    // Tombol Unduh / Download Hasil Akhir
    document.getElementById('btnDownloadPNG').addEventListener('click', () => downloadResult('png'));
    document.getElementById('btnDownloadJPG').addEventListener('click', () => downloadResult('jpeg'));
}

// 8. INTERAKSI SLIDER PERBANDINGAN (Before vs After)
function setupSlider() {
    let isSliding = false;
    
    const slideMove = (clientX) => {
        const rect = imageSlider.getBoundingClientRect();
        const x = clientX - rect.left;
        let percentage = (x / rect.width) * 100;
        if (percentage < 0) percentage = 0;
        if (percentage > 100) percentage = 100;

        sliderHandle.style.left = `${percentage}%`;
        imgBeforeContainer.style.width = `${percentage}%`;
    };

    sliderHandle.addEventListener('mousedown', () => isSliding = true);
    window.addEventListener('mouseup', () => isSliding = false);
    window.addEventListener('mousemove', (e) => { if (isSliding) slideMove(e.clientX); });

    // Dukungan Sentuh Mobile / Smartphone
    sliderHandle.addEventListener('touchstart', () => isSliding = true);
    window.addEventListener('touchend', () => isSliding = false);
    window.addEventListener('touchmove', (e) => { if (isSliding) slideMove(e.touches[0].clientX); });
}

function resetSliderPosition() {
    sliderHandle.style.left = '50%';
    imgBeforeContainer.style.width = '50%';
}

// 9. UNDUH GAMBAR (EXPORT ENGINE)
function downloadResult(format) {
    if (!appState.processedImageElement) return;

    // Tambahkan fallback otomatis jika men-download JPG tetapi background masih transparan
    if (format === 'jpeg' && appState.activeBgType === 'transparent') {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff'; // Kasih background putih default untuk JPG
        ctx.fillRect(0,0, mainCanvas.width, mainCanvas.height);
        ctx.restore();
    }

    const dataURL = mainCanvas.toDataURL(`image/${format}`, 1.0);
    const link = document.createElement('a');
    link.download = `GlassBG_${Date.now()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    link.href = dataURL;
    link.click();
    showToast('Gambar berhasil disimpan ke galeri!', 'success');
}

// 10. UTILITAS SISTEM (History, Toast, Loader)
function saveToHistory() {
    // Ambil snapshots data saat ini untuk kebutuhan fitur undo mendatang
    if (appState.historyStack.length > 5) appState.historyStack.shift();
    appState.historyStack.push(mainCanvas.toDataURL());
}

function showLoader(visible, text = 'Sedang memproses...') {
    const loader = document.getElementById('processingLoader');
    document.getElementById('progressStatus').innerText = text;
    loader.classList.toggle('hidden', !visible);
}

function updateProgress(percentage, statusText) {
    document.getElementById('progressFill').style.width = `${percentage}%`;
    if(statusText) document.getElementById('progressStatus').innerText = statusText;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
