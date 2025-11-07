if('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Registro SW exitoso: ', reg))
            .catch(err => console.error('Error de registro SW: ', err));    
    })
}

// Referencias a elementos del DOM
const openCameraBtn = document.getElementById('openCamera');
const cameraContainer = document.getElementById('cameraContainer');
const video = document.getElementById('video');
const takePhotoBtn = document.getElementById('takePhoto');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d'); // Contexto 2D para dibujar en el Canvas

const toggleCameraBtn = document.getElementById('toggleCamera');
const gallery = document.getElementById('gallery');
const galleryWrap = document.getElementById('galleryWrap');
const clearGalleryBtn = document.getElementById('clearGallery');
const toast = document.getElementById('toast-msg');

let stream = null; // Variable para almacenar el MediaStream de la cámara
let currentFacing = 'environment';

const db = new PouchDB('pwa_photos_v1');

// helper toast
function showToast(msg, color = '#222') {
    toast.textContent = msg;
    toast.style.background = color;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(()=> toast.style.display = 'none', 250);
    }, 1600);
}

async function openCamera() {
    try {
        // 1. Definición de Restricciones (Constraints)
        const constraints = {
            video: {
                facingMode: { ideal: currentFacing === 'user' ? 'user' : 'environment' }, // Solicita la cámara trasera, delantera 'user'
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };

        // 2. Obtener el Stream de Medios
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // 3. Asignar el Stream al Elemento <video>
        video.srcObject = stream;
        
        // 4. Actualización de la UI
        cameraContainer.style.display = 'block';
        openCameraBtn.textContent = 'Cámara Abierta';
        openCameraBtn.disabled = true;
        showToast('Cámara abierta', '#28a745');
        console.log('Cámara abierta exitosamente');
    } catch (error) {
        console.error('Error al acceder a la cámara:', error);
        showToast('Error al acceder a la cámara', '#dc3545');
    }
}

async function toggleCamera() {
    currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    if(stream) {
        closeCamera();
        await openCamera();
    } else {
        showToast(currentFacing === 'user' ? 'Cámara frontal seleccionada' : 'Cámara trasera seleccionada', '#317efb');
    }

    
}

async function takePhoto() {
    if (!stream) {
        showToast('Abre la cámara primero', '#dc3545');
        return;
    }

    // 1. Dibujar el Frame de Video en el Canvas
    // El método drawImage() es clave: toma el <video> como fuente.
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    canvas.width = vw;
    canvas.height = vh;

    ctx.drawImage(video, 0, 0, vw, vh);
    
    // 2. Conversión a Data URL
    const imageDataURL = canvas.toDataURL('image/png');

    const doc = {
        _id: new Date().toISOString(),
        ts: Date.now(),
        dataURL: imageDataURL
    };

    try {
        await db.put(doc);
        prependImageToGallery(doc.dataURL, doc._id);
        showToast('Foto guardada', '#28a745');
    } catch (error) {
        console.error('Error guardando foto:', err);
        showToast('Error al guardar', '#dc3545');
    }
    
    // 3. (Opcional) Visualización y Depuración
    console.log('Foto capturada en base64:', imageDataURL.length, 'caracteres');
    
    // 4. Cierre de la Cámara (Para liberar recursos)
    closeCamera();
}

function closeCamera() {
    if (stream) {
        // Detener todos los tracks del stream (video, audio, etc.)
        stream.getTracks().forEach(track => track.stop());
        stream = null; // Limpiar la referencia

        // Limpiar y ocultar UI
        video.srcObject = null;
        cameraContainer.style.display = 'none';
        
        // Restaurar el botón 'Abrir Cámara'
        openCameraBtn.textContent = 'Abrir Cámara';
        openCameraBtn.disabled = false;
        
        console.log('Cámara cerrada');
    }
}

async function renderGallery() {
    try {
        const res = await db.allDocs({ include_docs: true });
        const docs = res.rows.map(r => r.doc).sort((a, b) => b.ts - a.ts);
        gallery.innerHTML = '';
        docs.forEach(d => {
            appendImageToGalleryEnd(d.dataURL, d._id);
        });
    } catch (error) {
        console.error('Error cargando galería:', error);
    }
}

function prependImageToGallery(data, id) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = data;
    img.loading = 'lazy';
    img.title = id;
    // al click ampliar en nueva pestaña (opcional)
    img.addEventListener('click', () => window.open(data, '_blank'));
    gallery.insertBefore(img, gallery.firstChild);

    try {
        galleryWrap.scrollTop = 0;
    } catch (error) {
        console.error('Error actualizando galería:', error);
    }
}

function appendImageToGalleryEnd(data, id) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = data;
    img.loading = 'lazy';
    img.title = id;
    img.addEventListener('click', () => window.open(data, '_blank'));
    gallery.appendChild(img);
}

async function clearGallery() {
    try {
        const all = await db.allDocs();
        if (!all.rows.length) {
            showToast('Nada que limpiar', '#6c757d');
            return;
        }
        const dels = all.rows.map(r => ({ _id: r.id, _rev: r.value.rev, _deleted: true }));
        await db.bulkDocs(dels);
        gallery.innerHTML = '';
        showToast('Galería vaciada', '#317efb');
    } catch (err) {
        console.error('Error limpiando DB:', err);
        showToast('Error al limpiar', '#dc3545');
    }
}

// Event listeners para la interacción del usuario
openCameraBtn.addEventListener('click', openCamera);
takePhotoBtn.addEventListener('click', takePhoto);
toggleCameraBtn.addEventListener('click', toggleCamera);
clearGalleryBtn.addEventListener('click', clearGallery);

// Cargar la galería al iniciar la aplicación
renderGallery();

// Limpiar stream cuando el usuario cierra o navega fuera de la página
window.addEventListener('beforeunload', () => {
    closeCamera();
});

