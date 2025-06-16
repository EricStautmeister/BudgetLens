// frontend/src/App.tsx 

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ThemeProvider } from './contexts/ThemeContext';

import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transfers from './pages/Transfers';
// import EnhancedTransfers from './pages/Transfers';
import Settings from './pages/Settings';
import TransferSettingsRedirect from './pages/TransferSettingsRedirect';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Budgets from './pages/Budgets';
import Upload from './pages/Upload';
import UploadManagement from './pages/UploadManagement';
import Review from './pages/Review';
import LearnedPatterns from './pages/LearnedPatterns';
import VendorPatternTest from './pages/VendorPatternTest';
import { useEffect } from 'react';

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			staleTime: 5 * 60 * 1000, // 5 minutes
			gcTime: 10 * 60 * 1000, // Cache: 10 minutes
		},
		mutations: {
			retry: 1,
		},
	},
});

// Security: Content Security Policy helper
const setupCSP = () => {
	const meta = document.createElement('meta');
	meta.httpEquiv = 'Content-Security-Policy';
	meta.content = `
		default-src 'self';
		script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com;
		style-src 'self' 'unsafe-inline';
		font-src 'self' data:;
		img-src 'self' data: https:;
		connect-src 'self' http://localhost:* http://127.0.0.1:* http://192.168.10.133:* ws://localhost:* ws://192.168.10.133:*;
		base-uri 'self';
		form-action 'self';
	`.replace(/\s+/g, ' ').trim();
	document.head.appendChild(meta);
};

// Security: Audit logging helper
const logSecurityEvent = (event: string, details?: any) => {
	console.log(`[Security] ${event}`, details);
	// In production, send to security monitoring service
};

function App() {
	useEffect(() => {
		// Security setup
		setupCSP();

		// Log app initialization
		logSecurityEvent('App initialized', {
			timestamp: new Date().toISOString(),
			userAgent: navigator.userAgent,
			url: window.location.href
		});

		// Security: Prevent right-click context menu in production
		if (import.meta.env.PROD) {
			document.addEventListener('contextmenu', (e) => {
				e.preventDefault();
			});
		}

		// Security: Detect developer tools
		let devtools = false;
		const detectDevTools = () => {
			if (window.outerHeight - window.innerHeight > 200 || window.outerWidth - window.innerWidth > 200) {
				if (!devtools) {
					devtools = true;
					logSecurityEvent('Developer tools detected');
				}
			} else {
				devtools = false;
			}
		};

		if (import.meta.env.PROD) {
			setInterval(detectDevTools, 1000);
		}

		// Security: Clear sensitive data on page unload
		const clearSensitiveData = () => {
			// Clear any cached sensitive data
			sessionStorage.clear();
			// Note: We keep localStorage for auth tokens
		};

		window.addEventListener('beforeunload', clearSensitiveData);

		return () => {
			window.removeEventListener('beforeunload', clearSensitiveData);
			document.removeEventListener('contextmenu', () => { });
		};
	}, []);

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider>
				<LocalizationProvider dateAdapter={AdapterDateFns}>
					<SnackbarProvider
						maxSnack={3}
						anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
						preventDuplicate
						dense>
						<CssBaseline />
						<Router>
							<Routes>
								<Route path="/login" element={<Login />} />
								<Route path="/register" element={<Register />} />
								<Route
									path="/"
									element={
										<PrivateRoute>
											<Layout />
										</PrivateRoute>
									}>
									<Route index element={<Navigate to="/dashboard" replace />} />
									<Route path="dashboard" element={<Dashboard />} />
									<Route path="accounts" element={<Accounts />} />

									{/* Enhanced Transfer Routes */}
									<Route path="transfers" element={<Transfers />} />
									<Route path="transfers/legacy" element={<Transfers />} />
									<Route path="transfers/settings" element={<TransferSettingsRedirect />} />

									{/* General Settings */}
									<Route path="settings" element={<Settings />} />

									<Route path="transactions" element={<Transactions />} />
									<Route path="categories" element={<Categories />} />
									<Route path="budgets" element={<Budgets />} />
									<Route path="upload" element={<Upload />} />
									<Route path="upload-management" element={<UploadManagement />} />
									<Route path="review" element={<Review />} />
									<Route path="patterns" element={<LearnedPatterns />} />
									<Route path="pattern-test" element={<VendorPatternTest />} />

									{/* Fallback route */}
									<Route path="*" element={<Navigate to="/dashboard" replace />} />
								</Route>
							</Routes>
						</Router>
					</SnackbarProvider>
				</LocalizationProvider>
			</ThemeProvider>
		</QueryClientProvider>
	);
}

export default App;