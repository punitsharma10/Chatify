import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// smoke test: the app shell (toaster + routed page area) renders
test('renders the app shell', () => {
  const { container } = render(<MemoryRouter><App /></MemoryRouter>);
  expect(container.querySelector('main')).toBeInTheDocument();
});
