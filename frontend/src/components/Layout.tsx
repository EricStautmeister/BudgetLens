// frontend/src/components/Layout.tsx - Completed Layout component with enhanced header and notifications

import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
	AppBar,
	Box,
	CssBaseline,
	Divider,
	Drawer,
	IconButton,
	List,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Toolbar,
	Typography,
	Collapse,
	Chip,
	Tooltip,
	Alert,
	Snackbar,
	Badge,
	Button,
	Avatar,
	Menu,
	MenuItem as MuiMenuItem,
	useTheme,
	useMediaQuery,
} from '@mui/material';
import {
	Menu as MenuIcon,
	Dashboard,
	Receipt,
	Category,
	AccountBalance,
	CloudUpload,
	RateReview,
	Logout,
	Storage,
	Psychology,
	BugReport,
	SwapHoriz,
	AccountBalanceWallet,
	Tune,
	ExpandLess,
	ExpandMore,
	Security,
	TrendingUp,
	Warning,
	NewReleases,
	Settings as SettingsIcon,
	AccountCircle,
	NotificationsOutlined,
	KeyboardArrowDown,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';

const drawerWidth = 240;

interface MenuItem {
	text: string;
	icon: React.ReactElement;
	path?: string;
	children?: MenuItem[];
	badge?: string | number;
	isNew?: boolean;
	isEnhanced?: boolean;
}

const useMenuItems = (): MenuItem[] => {
	const { data: reviewCount } = useQuery({
		queryKey: ['reviewCount'],
		queryFn: async () => {
			try {
				const response = await apiClient.getReviewQueue();
				return response.data.length;
			} catch (error) {
				console.warn('Failed to fetch review count:', error);
				return 0;
			}
		},
		refetchInterval: 30000, // Refresh every 30 seconds
		initialData: 0,
	});

	const { data: transferSuggestions } = useQuery({
		queryKey: ['transferSuggestionsCount'],
		queryFn: async () => {
			try {
				const response = await apiClient.getTransferSuggestions(5);
				return response.data.count;
			} catch (error) {
				console.warn('Failed to fetch transfer suggestions:', error);
				return 0;
			}
		},
		refetchInterval: 60000, // Refresh every minute
		initialData: 0,
	});

	const menuItems = [
		{ text: 'Dashboard', icon: <Dashboard />, path: '/dashboard' },
		{ text: 'Accounts', icon: <AccountBalanceWallet />, path: '/accounts' },

		// Enhanced Transfer Section
		{
			text: 'Transfers',
			icon: <SwapHoriz />,
			children: [
				{
					text: 'Smart Transfer Detection',
					icon: <TrendingUp />,
					path: '/transfers',
					badge: transferSuggestions > 0 ? transferSuggestions : undefined
				},
			]
		},

		// Transactions Section
		{
			text: 'Transactions',
			icon: <Receipt />,
			children: [
				{
					text: 'All Transactions',
					icon: <Storage />,
					path: '/transactions'
				},
				{
					text: 'Review Transactions',
					icon: <RateReview />,
					path: '/review',
					badge: reviewCount > 0 ? reviewCount : undefined
				},
				{
					text: 'Upload Transactions',
					icon: <CloudUpload />,
					path: '/upload'
				},
				{
					text: 'Upload Management',
					icon: <Storage />,
					path: '/upload-management'
				},
			]
		},

		// Budget Section
		{
			text: 'Budgeting',
			icon: <AccountBalance />,
			children: [
				{
					text: 'Budget Categories',
					icon: <Category />,
					path: '/categories'
				},
				{
					text: 'Budget Planning',
					icon: <TrendingUp />,
					path: '/budgets'
				},
			]
		},

		// Settings and Tools
		{
			text: 'Settings & Tools',
			icon: <SettingsIcon />,
			children: [
				{
					text: 'Settings',
					icon: <Tune />,
					path: '/settings',
					isEnhanced: true
				},
				{
					text: 'Pattern Testing',
					icon: <Psychology />,
					path: '/vendor-pattern-test'
				},
				{
					text: 'Learned Patterns',
					icon: <BugReport />,
					path: '/learned-patterns'
				},
			]
		},
	];

	return menuItems;
};

export default function Layout() {
	const [mobileOpen, setMobileOpen] = useState(false);
	const [openSubMenus, setOpenSubMenus] = useState<{ [key: string]: boolean }>({});
	const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
		open: false,
		message: '',
		severity: 'info',
	});
	const [securityAlert, setSecurityAlert] = useState<string | null>(null);
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const navigate = useNavigate();
	const location = useLocation();
	const menuItems = useMenuItems();
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down('md'));

	// Debug logging
	// useEffect(() => {
	// 	console.log('openSubMenus state changed:', openSubMenus);
	// }, [openSubMenus]);

	// useEffect(() => {
	// 	console.log('menuItems changed:', menuItems);
	// }, [menuItems]);

	useEffect(() => {
		// Close drawer on mobile after navigation
		if (isMobile) {
			setMobileOpen(false);
		}
	}, [location.pathname, isMobile]);

	useEffect(() => {
		// Pre-open submenu for current path when route changes
		const currentPath = location.pathname;

		setOpenSubMenus((prevState) => {
			const newOpenSubMenus = { ...prevState };
			let hasChanges = false;

			menuItems.forEach((item) => {
				if (item.children) {
					const hasActiveChild = item.children.some(
						(child) => child.path === currentPath || (child.path && currentPath.includes(child.path))
					);
					// Only auto-open if not explicitly set before
					if (hasActiveChild && !(item.text in prevState)) {
						newOpenSubMenus[item.text] = true;
						hasChanges = true;
					}
				}
			});

			return hasChanges ? newOpenSubMenus : prevState;
		});
	}, [location.pathname, menuItems]);

	const handleDrawerToggle = () => {
		setMobileOpen((prevState) => !prevState);
	};

	const handleSubMenuToggle = (text: string) => {
		setOpenSubMenus((prevState) => {
			const newState = {
				...prevState,
				[text]: !prevState[text],
			};
			return newState;
		});
	};

	const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleMenuClose = () => {
		setAnchorEl(null);
	};

	const handleLogout = () => {
		handleMenuClose();
		localStorage.removeItem('access_token');
		localStorage.removeItem('refresh_token');
		navigate('/login');
	};

	const handleSnackbarClose = () => {
		setSnackbar({ ...snackbar, open: false });
	};

	const isMenuItemActive = (path?: string) => {
		if (!path) return false;
		return location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
	};

	// Show badge if there are pending reviews
	const reviewCount = menuItems
		.flatMap((item) => item.children || [])
		.find((item) => item.path === '/review')?.badge;

	const drawer = (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<Toolbar sx={{ justifyContent: 'center', py: 1 }}>
				<Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
					BudgetLens
				</Typography>
			</Toolbar>
			<Divider />
			<List sx={{ flexGrow: 1, overflowY: 'auto', py: 0 }}>
				{menuItems.map((item) => (
					<React.Fragment key={item.text}>
						{item.children ? (
							<>
								<ListItem disablePadding>
									<ListItemButton
										onClick={() => handleSubMenuToggle(item.text)}
										sx={{ py: 1 }}
									>
										<ListItemIcon>
											{item.badge ? (
												<Badge badgeContent={item.badge} color="error">
													{item.icon}
												</Badge>
											) : (
												item.icon
											)}
										</ListItemIcon>
										<ListItemText primary={item.text} />
										{openSubMenus[item.text] ? <ExpandLess /> : <ExpandMore />}
									</ListItemButton>
								</ListItem>
								<Collapse
									in={openSubMenus[item.text]}
									timeout="auto"
									unmountOnExit
									sx={{
										bgcolor: 'action.hover',
										borderLeft: '2px solid',
										borderColor: 'primary.main',
										ml: 1,
									}}
								>
									<List component="div" disablePadding>
										{item.children.map((child) => (
											<ListItemButton
												key={child.text}
												component={Link}
												to={child.path || '#'}
												sx={{
													pl: 4,
													py: 0.75,
													backgroundColor: isMenuItemActive(child.path)
														? 'primary.main'
														: 'transparent',
													color: isMenuItemActive(child.path)
														? 'primary.contrastText'
														: 'inherit',
													'&:hover': {
														backgroundColor: isMenuItemActive(child.path)
															? 'primary.dark'
															: 'action.hover',
													},
													borderRadius: 1,
													mx: 0.5,
												}}
											>
												<ListItemIcon sx={{ minWidth: 40 }}>
													{child.badge ? (
														<Badge badgeContent={child.badge} color="error">
															{child.icon}
														</Badge>
													) : (
														child.icon
													)}
												</ListItemIcon>
												<ListItemText
													primary={
														<Box sx={{ display: 'flex', alignItems: 'center' }}>
															{child.text}
															{child.isNew && (
																<Chip
																	label="New"
																	size="small"
																	color="primary"
																	sx={{ ml: 1, height: 20, fontSize: '0.6rem' }}
																/>
															)}
															{child.isEnhanced && (
																<Chip
																	label="Enhanced"
																	size="small"
																	color="secondary"
																	sx={{ ml: 1, height: 20, fontSize: '0.6rem' }}
																/>
															)}
														</Box>
													}
												/>
											</ListItemButton>
										))}
									</List>
								</Collapse>
							</>
						) : (
							<ListItem disablePadding>
								<ListItemButton
									component={Link}
									to={item.path || '#'}
									sx={{
										py: 1,
										backgroundColor: isMenuItemActive(item.path)
											? 'rgba(0, 0, 0, 0.08)'
											: 'transparent',
									}}
								>
									<ListItemIcon>
										{item.badge ? (
											<Badge badgeContent={item.badge} color="error">
												{item.icon}
											</Badge>
										) : (
											item.icon
										)}
									</ListItemIcon>
									<ListItemText
										primary={
											<Box sx={{ display: 'flex', alignItems: 'center' }}>
												{item.text}
												{item.isNew && (
													<Chip
														label="New"
														size="small"
														color="primary"
														sx={{ ml: 1, height: 20, fontSize: '0.6rem' }}
													/>
												)}
											</Box>
										}
									/>
								</ListItemButton>
							</ListItem>
						)}
					</React.Fragment>
				))}
			</List>
			<Divider />
			<List>
				<ListItemButton onClick={handleLogout}>
					<ListItemIcon>
						<Logout />
					</ListItemIcon>
					<ListItemText primary="Logout" />
				</ListItemButton>
			</List>
		</Box>
	);

	return (
		<Box sx={{ display: 'flex' }}>
			<CssBaseline />
			<AppBar
				position="fixed"
				sx={{
					width: { sm: `calc(100% - ${drawerWidth}px)` },
					ml: { sm: `${drawerWidth}px` },
					boxShadow: 1,
				}}>
				<Toolbar>
					<IconButton
						color="inherit"
						aria-label="open drawer"
						edge="start"
						onClick={handleDrawerToggle}
						sx={{ mr: 2, display: { sm: 'none' } }}>
						<MenuIcon />
					</IconButton>

					<Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
						{/* Dynamic page title based on route */}
						{location.pathname === '/dashboard' && 'Dashboard'}
						{location.pathname === '/accounts' && 'Accounts'}
						{location.pathname === '/transactions' && 'Transactions'}
						{location.pathname === '/categories' && 'Categories'}
						{location.pathname === '/budgets' && 'Budget Planning'}
						{location.pathname === '/transfers' && 'Transfers'}
						{location.pathname === '/review' && 'Transaction Review'}
						{location.pathname === '/upload' && 'Upload Transactions'}
						{location.pathname === '/upload-management' && 'Upload Management'}
						{location.pathname === '/settings' && 'Settings'}
						{location.pathname === '/vendor-pattern-test' && 'Pattern Testing'}
						{location.pathname === '/learned-patterns' && 'Learned Patterns'}
					</Typography>

					{/* Action buttons */}
					<Box sx={{ display: 'flex', alignItems: 'center' }}>
						{reviewCount && typeof reviewCount === 'number' && reviewCount > 0 ? (
							<Tooltip title={`${reviewCount} transactions need review`}>
								<Button
									color="inherit"
									size="small"
									startIcon={<Badge badgeContent={reviewCount} color="error"><RateReview /></Badge>}
									onClick={() => navigate('/review')}
									sx={{ mr: 1 }}
								>
									Review
								</Button>
							</Tooltip>
						) : null}

						{/* User avatar and dropdown */}
						<Box>
							<Button
								color="inherit"
								onClick={handleProfileMenuOpen}
								endIcon={<KeyboardArrowDown />}
								startIcon={
									<Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.dark' }}>
										<AccountCircle />
									</Avatar>
								}
							>
								Profile
							</Button>
							<Menu
								anchorEl={anchorEl}
								open={Boolean(anchorEl)}
								onClose={handleMenuClose}
								anchorOrigin={{
									vertical: 'bottom',
									horizontal: 'right',
								}}
								transformOrigin={{
									vertical: 'top',
									horizontal: 'right',
								}}
							>
								<MuiMenuItem onClick={() => {
									handleMenuClose();
									navigate('/settings');
								}}>
									<ListItemIcon>
										<SettingsIcon fontSize="small" />
									</ListItemIcon>
									Settings
								</MuiMenuItem>
								<Divider />
								<MuiMenuItem onClick={handleLogout}>
									<ListItemIcon>
										<Logout fontSize="small" />
									</ListItemIcon>
									Logout
								</MuiMenuItem>
							</Menu>
						</Box>
					</Box>
				</Toolbar>
			</AppBar>

			<Box
				component="nav"
				sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
				aria-label="mailbox folders">
				{/* Mobile drawer */}
				<Drawer
					variant="temporary"
					open={mobileOpen}
					onClose={handleDrawerToggle}
					ModalProps={{
						keepMounted: true, // Better mobile performance
					}}
					sx={{
						display: { xs: 'block', sm: 'none' },
						'& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
					}}>
					{drawer}
				</Drawer>
				{/* Desktop drawer */}
				<Drawer
					variant="permanent"
					sx={{
						display: { xs: 'none', sm: 'block' },
						'& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
					}}
					open>
					{drawer}
				</Drawer>
			</Box>

			{/* Main content */}
			<Box
				component="main"
				sx={{
					flexGrow: 1,
					width: { sm: `calc(100% - ${drawerWidth}px)` },
					minHeight: '100vh',
					bgcolor: 'background.default',
					display: 'flex',
					flexDirection: 'column',
				}}>
				<Toolbar /> {/* Spacing to push content below app bar */}

				{/* Security alert if present */}
				<Snackbar
					anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
					open={!!securityAlert}
					autoHideDuration={6000}
					onClose={() => setSecurityAlert(null)}>
					<Alert
						severity="warning"
						variant="filled"
						elevation={6}
						onClose={() => setSecurityAlert(null)}
					>
						{securityAlert}
					</Alert>
				</Snackbar>

				{/* Regular notifications */}
				<Snackbar
					open={snackbar.open}
					autoHideDuration={6000}
					onClose={handleSnackbarClose}
					anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
					<Alert onClose={handleSnackbarClose} severity={snackbar.severity}>
						{snackbar.message}
					</Alert>
				</Snackbar>

				{/* Main content area */}
				<Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 3 }}>
					<Outlet />
				</Box>
			</Box>
		</Box>
	);
}