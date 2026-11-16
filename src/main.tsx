import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Vô hiệu hóa Context Menu mặc định của trình duyệt CHỈ KHI click vào bên trong thẻ <canvas>
document.addEventListener('contextmenu', (event: MouseEvent) => {
  const target = event.target;
  if (
    target instanceof HTMLCanvasElement ||
    (target instanceof Element && target.closest('canvas'))
  ) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(<App />);

