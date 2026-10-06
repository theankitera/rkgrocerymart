// ── Cloudinary Upload Helper ──────────────────────────────────────────────
// Ye file Supabase Storage ki jagah use hoti hai
// Cloud Name aur Upload Preset yahan set karein

const CLOUD_NAME = 'delf8iyzt';
const UPLOAD_PRESET = 'myshop_preset';

// Canvas se image compress karo — quality visually same, size 60-70% kam
function compressImage(file, maxPx = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// Main upload function — Cloudinary par image upload karo aur public URL lo
export async function uploadToCloudinary(file, folder = 'myshop') {
  // Pehle compress karo
  const compressed = await compressImage(file, 1200, 0.85);
  const uploadFile = compressed instanceof Blob ? compressed : file;

  const formData = new FormData();
  formData.append('file', uploadFile);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.secure_url) return { url: data.secure_url };
    throw new Error(data.error?.message || 'Upload fail ho gaya');
  } catch (err) {
    console.error('[Cloudinary] Upload error:', err);
    return { url: null, error: err.message };
  }
}