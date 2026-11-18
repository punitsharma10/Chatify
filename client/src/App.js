import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import './App.css';
import { Outlet } from 'react-router-dom';
import AppUpdateBanner from './components/AppUpdateBanner';

const phoneQuery = '(max-width: 767px)';

// WhatsApp-style snackbars: bottom-left on desktop, bottom-center above the composer on phones,
// dark slate background, no icons, sentence-case text.
function App() {
  const [phone, setPhone] = useState(() => window.matchMedia(phoneQuery).matches);

  useEffect(() => {
    const mq = window.matchMedia(phoneQuery);
    const update = () => setPhone(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return (
    <>
      <Toaster
        position={phone ? 'bottom-center' : 'bottom-left'}
        gutter={8}
        containerStyle={phone ? { bottom: 'calc(80px + env(safe-area-inset-bottom))', left: 12, right: 12 } : { bottom: 28, left: 28 }}
        toastOptions={{
          duration: 3500,
          icon: null,
          className: 'wa-toast',
          style: {
            background: '#3b4a54',
            color: '#ffffff',
            fontSize: '14.2px',
            lineHeight: '20px',
            padding: '12px 20px',
            borderRadius: '6px',
            boxShadow: '0 3px 12px rgba(11, 20, 26, .3)',
            maxWidth: phone ? '100%' : '440px',
            minWidth: phone ? '100%' : '300px',
            justifyContent: 'flex-start',
          },
          success: { icon: null },
          error: { icon: null, duration: 4500 },
          loading: { icon: null },
        }}
      />
      <AppUpdateBanner />
      <main>
        <Outlet />
      </main>
    </>
  );
}

export default App;
