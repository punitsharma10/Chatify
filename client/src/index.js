import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { RouterProvider } from 'react-router-dom';
import router from './routes/Routes';
import { Provider } from 'react-redux';
import { store } from './redux/store';
import axios from 'axios';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import { watchTheme, applyFontSize } from './helpers/theme';

// light / dark theme and chat font size before the first render (no flash of the wrong theme)
watchTheme();
applyFontSize();

// Windows has no flag emojis (it shows "IN" instead of 🇮🇳): load a small flag-only font there, from our own site
polyfillCountryFlagEmojis('Twemoji Country Flags', `${process.env.PUBLIC_URL}/fonts/TwemojiCountryFlags.woff2`);

// send the login token with every request to our own backend (not to Cloudinary)
axios.interceptors.request.use((config) => {
  const backend = process.env.REACT_APP_BACKEND_URL;
  let token = null;
  try { token = localStorage.getItem('token'); } catch { /* storage unavailable */ }
  if (token && backend && config.url?.startsWith(backend)) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
    <Provider store={store}>
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    </Provider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
