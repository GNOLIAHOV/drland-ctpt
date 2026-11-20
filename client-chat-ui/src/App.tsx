import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { ChatWidgetProvider } from './context/ChatWidgetContext';
import Layout from './components/Layout';
import Home from './pages/Home';

export default function App() {
  return (
    <ErrorBoundary>
      <ChatWidgetProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ChatWidgetProvider>
    </ErrorBoundary>
  );
}
