import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Budgets from './pages/Budgets';
import Upload from './pages/Upload';
import Review from './pages/Review';

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

const theme = createTheme({
	palette: {
		primary: {
			main: '#1976d2',
		},
		secondary: {
			main: '#dc004e',
		},
		background: {
			default: '#f5f5f5',
		},
	},
	typography: {
		fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
	},
	components: {
		MuiButton: {
			styleOverrides: {
				root: {
					textTransform: 'none',
				},
			},
		},
	},
});

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider theme={theme}>
				<LocalizationProvider dateAdapter={AdapterDateFns}>
					<SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
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
									<Route path="transactions" element={<Transactions />} />
									<Route path="categories" element={<Categories />} />
									<Route path="budgets" element={<Budgets />} />
									<Route path="upload" element={<Upload />} />
									<Route path="review" element={<Review />} />
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
