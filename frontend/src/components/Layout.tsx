import React from 'react';
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
	Button,
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
} from '@mui/icons-material';

const drawerWidth = 240;

const menuItems = [
	{ text: 'Dashboard', icon: <Dashboard />, path: '/dashboard' },
	{ text: 'Transactions', icon: <Receipt />, path: '/transactions' },
	{ text: 'Categories', icon: <Category />, path: '/categories' },
	{ text: 'Budgets', icon: <AccountBalance />, path: '/budgets' },
	{ text: 'Upload CSV', icon: <CloudUpload />, path: '/upload' },
	{ text: 'Review Queue', icon: <RateReview />, path: '/review' },
];

export default function Layout() {
	const [mobileOpen, setMobileOpen] = React.useState(false);
	const location = useLocation();
	const navigate = useNavigate();

	const handleDrawerToggle = () => {
		setMobileOpen(!mobileOpen);
	};

	const handleLogout = () => {
		localStorage.removeItem('access_token');
		localStorage.removeItem('refresh_token');
		navigate('/login');
	};

	const drawer = (
		<div>
			<Toolbar>
				<Typography variant="h6" noWrap component="div">
					PennyPilot
				</Typography>
			</Toolbar>
			<Divider />
			<List>
				{menuItems.map((item) => (
					<ListItem key={item.text} disablePadding>
						<ListItemButton component={Link} to={item.path} selected={location.pathname === item.path}>
							<ListItemIcon>{item.icon}</ListItemIcon>
							<ListItemText primary={item.text} />
						</ListItemButton>
					</ListItem>
				))}
			</List>
			<Divider />
			<List>
				<ListItem disablePadding>
					<ListItemButton onClick={handleLogout}>
						<ListItemIcon>
							<Logout />
						</ListItemIcon>
						<ListItemText primary="Logout" />
					</ListItemButton>
				</ListItem>
			</List>
		</div>
	);

	return (
		<Box sx={{ display: 'flex' }}>
			<CssBaseline />
			<AppBar
				position="fixed"
				sx={{
					width: { sm: `calc(100% - ${drawerWidth}px)` },
					ml: { sm: `${drawerWidth}px` },
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
					<Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
						Personal Budget Manager
					</Typography>
				</Toolbar>
			</AppBar>
			<Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
				<Drawer
					variant="temporary"
					open={mobileOpen}
					onClose={handleDrawerToggle}
					ModalProps={{
						keepMounted: true,
					}}
					sx={{
						display: { xs: 'block', sm: 'none' },
						'& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
					}}>
					{drawer}
				</Drawer>
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
			<Box
				component="main"
				sx={{
					flexGrow: 1,
					p: 3,
					width: { sm: `calc(100% - ${drawerWidth}px)` },
					mt: 8,
				}}>
				<Outlet />
			</Box>
		</Box>
	);
}
