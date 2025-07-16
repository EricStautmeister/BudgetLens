// frontend/src/pages/Accounts.tsx - Updated with balance editing

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Box,
	Paper,
	Typography,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Button,
	IconButton,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	TextField,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Chip,
	Card,
	CardContent,
	Grid,
	Switch,
	FormControlLabel,
	Alert,
	Tooltip,
} from '@mui/material';
import {
	Add,
	Edit,
	Delete,
	AccountBalance,
	CreditCard,
	Savings,
	TrendingUp,
	Star,
	StarBorder,
	EditNote, // Added for balance edit icon
	MonetizationOn, // Added for savings pockets
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';
import { BalanceEditDialog } from '../components/BalanceEditDialog'; // Import the new component
import { SavingsAccountMappingDialog } from '../components/SavingsAccountMappingDialog'; // Import savings dialog

interface Account {
	id: string;
	name: string;
	account_type: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'INVESTMENT' | 'LOAN';
	institution?: string;
	account_number_last4?: string;
	currency: string;
	is_default: boolean;
	balance: number;
	transaction_count: number;
	created_at: string;
	is_active: boolean;
	is_main_account: boolean;
	account_classification: string;
}

const accountTypeLabels = {
	CHECKING: 'Checking',
	SAVINGS: 'Savings',
	CREDIT_CARD: 'Credit Card',
	INVESTMENT: 'Investment',
	LOAN: 'Loan',
};

const accountTypeIcons = {
	CHECKING: <AccountBalance />,
	SAVINGS: <Savings />,
	CREDIT_CARD: <CreditCard />,
	INVESTMENT: <TrendingUp />,
	LOAN: <AccountBalance />,
};

const accountTypeColors = {
	CHECKING: 'primary',
	SAVINGS: 'success',
	CREDIT_CARD: 'warning',
	INVESTMENT: 'info',
	LOAN: 'error',
} as const;

export default function Accounts() {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [open, setOpen] = useState(false);
	const [editingAccount, setEditingAccount] = useState<Account | null>(null);

	// NEW: Balance editing state
	const [balanceEditOpen, setBalanceEditOpen] = useState(false);
	const [editingBalanceAccount, setEditingBalanceAccount] = useState<Account | null>(null);

	// NEW: Savings pocket management state
	const [savingsDialogOpen, setSavingsDialogOpen] = useState(false);

	const [formData, setFormData] = useState({
		name: '',
		account_type: 'CHECKING' as Account['account_type'],
		institution: '',
		account_number_last4: '',
		currency: 'CHF',
		is_default: false,
	});

	const { data: accounts, isLoading } = useQuery<Account[]>({
		queryKey: ['accounts'],
		queryFn: async () => {
			const response = await apiClient.getAccounts();
			return response.data;
		},
	});

	const createMutation = useMutation({
		mutationFn: async (data: any) => {
			return apiClient.createAccount(data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['accounts'] });
			queryClient.invalidateQueries({ queryKey: ['transactions'] });
			enqueueSnackbar('Account created successfully', { variant: 'success' });
			handleClose();
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to create account', { variant: 'error' });
		},
	});

	const updateMutation = useMutation({
		mutationFn: async ({ id, data }: { id: string; data: any }) => {
			return apiClient.updateAccount(id, data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['accounts'] });
			enqueueSnackbar('Account updated successfully', { variant: 'success' });
			handleClose();
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to update account', { variant: 'error' });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			return apiClient.deleteAccount(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['accounts'] });
			queryClient.invalidateQueries({ queryKey: ['transactions'] });
			enqueueSnackbar('Account deleted successfully', { variant: 'success' });
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Delete failed', { variant: 'error' });
		},
	});

	const handleOpen = (account?: Account) => {
		if (account) {
			setEditingAccount(account);
			setFormData({
				name: account.name,
				account_type: account.account_type,
				institution: account.institution || '',
				account_number_last4: account.account_number_last4 || '',
				currency: account.currency,
				is_default: account.is_default,
			});
		} else {
			setEditingAccount(null);
			setFormData({
				name: '',
				account_type: 'CHECKING',
				institution: '',
				account_number_last4: '',
				currency: 'CHF',
				is_default: false,
			});
		}
		setOpen(true);
	};

	const handleClose = () => {
		setOpen(false);
		setEditingAccount(null);
	};

	// NEW: Balance editing handlers
	const handleEditBalance = (account: Account) => {
		setEditingBalanceAccount(account);
		setBalanceEditOpen(true);
	};

	const handleCloseBalanceEdit = () => {
		setBalanceEditOpen(false);
		setEditingBalanceAccount(null);
	};

	const handleSubmit = () => {
		if (editingAccount) {
			updateMutation.mutate({ id: editingAccount.id, data: formData });
		} else {
			createMutation.mutate(formData);
		}
	};

	const getTotalBalance = () => {
		if (!accounts || !Array.isArray(accounts)) return 0;
		return accounts.reduce((total, account) => total + account.balance, 0);
	};

	const formatCurrency = (amount: number, currency: string = 'CHF') => {
		return new Intl.NumberFormat('en-CH', {
			style: 'currency',
			currency: currency,
		}).format(amount);
	};

	if (isLoading) {
		return <Typography>Loading accounts...</Typography>;
	}

	return (
		<Box>
			<Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
				<Typography variant="h4">Account Management</Typography>
				<Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>
					Add Account
				</Button>
			</Box>

			<Alert severity="info" sx={{ mb: 3 }}>
				Manage your bank accounts to categorize transactions and track transfers between accounts.
				Set one account as default for new transactions.
			</Alert>

			{/* Summary Cards */}
			<Grid container spacing={3} sx={{ mb: 3 }}>
				<Grid item xs={12} md={4}>
					<Card>
						<CardContent>
							<Typography color="textSecondary" gutterBottom>
								Total Accounts
							</Typography>
							<Typography variant="h4">{accounts?.length || 0}</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={4}>
					<Card>
						<CardContent>
							<Typography color="textSecondary" gutterBottom>
								Total Balance
							</Typography>
							<Typography variant="h4">{formatCurrency(getTotalBalance())}</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={4}>
					<Card>
						<CardContent>
							<Typography color="textSecondary" gutterBottom>
								Total Transactions
							</Typography>
							<Typography variant="h4">
								{(accounts && Array.isArray(accounts)) ? accounts.reduce((total, account) => total + account.transaction_count, 0) : 0}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
			</Grid>

			{/* Accounts Table */}
			<TableContainer component={Paper}>
				<Table>
					<TableHead>
						<TableRow>
							<TableCell>Account</TableCell>
							<TableCell>Type</TableCell>
							<TableCell>Institution</TableCell>
							<TableCell align="right">Balance</TableCell>
							<TableCell align="right">Transactions</TableCell>
							<TableCell>Default</TableCell>
							<TableCell align="center">Actions</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{(accounts && Array.isArray(accounts)) ? accounts.map((account) => (
							<TableRow key={account.id}>
								<TableCell>
									<Box display="flex" alignItems="center" gap={1}>
										{accountTypeIcons[account.account_type]}
										<Box>
											<Typography variant="body1" fontWeight="medium">
												{account.name}
											</Typography>
											{account.account_number_last4 && (
												<Typography variant="caption" color="textSecondary">
													****{account.account_number_last4}
												</Typography>
											)}
										</Box>
									</Box>
								</TableCell>
								<TableCell>
									<Chip
										label={accountTypeLabels[account.account_type]}
										color={accountTypeColors[account.account_type]}
										size="small"
									/>
								</TableCell>
								<TableCell>{account.institution || '-'}</TableCell>
								<TableCell align="right">
									{/* UPDATED: Balance cell with edit functionality */}
									<Box display="flex" alignItems="center" justifyContent="flex-end" gap={1}>
										<Typography
											variant="body2"
											color={account.balance >= 0 ? 'success.main' : 'error.main'}
											fontWeight="medium">
											{formatCurrency(account.balance, account.currency)}
										</Typography>
										<IconButton
											size="small"
											onClick={() => handleEditBalance(account)}
											title="Edit balance">
											<EditNote fontSize="small" />
										</IconButton>
									</Box>
								</TableCell>
								<TableCell align="right">
									<Typography variant="body2">{account.transaction_count}</Typography>
								</TableCell>
								<TableCell>
									{account.is_default ? (
										<Tooltip title="Default account">
											<Star color="primary" />
										</Tooltip>
									) : (
										<StarBorder color="disabled" />
									)}
								</TableCell>
								<TableCell align="center">
									<IconButton onClick={() => handleOpen(account)} size="small">
										<Edit />
									</IconButton>
									<IconButton
										onClick={() => {
											if (
												confirm(
													`Delete account "${account.name}"? This will not delete associated transactions.`
												)
											) {
												deleteMutation.mutate(account.id);
											}
										}}
										size="small"
										color="error"
										disabled={account.transaction_count > 0}>
										<Delete />
									</IconButton>
								</TableCell>
							</TableRow>
						)) : []}
					</TableBody>
				</Table>
			</TableContainer>

			{(accounts && Array.isArray(accounts) && accounts.length === 0) && (
				<Paper sx={{ p: 3, textAlign: 'center', mt: 2 }}>
					<AccountBalance sx={{ fontSize: 48, color: 'action.disabled', mb: 2 }} />
					<Typography variant="h6" color="textSecondary" gutterBottom>
						No accounts found
					</Typography>
					<Typography variant="body2" color="textSecondary" paragraph>
						Create your first account to start organizing your transactions by bank account.
					</Typography>
					<Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>
						Create First Account
					</Button>
				</Paper>
			)}

			{/* Savings Pocket Management Section */}
			{(accounts && Array.isArray(accounts) && accounts.length > 0) && (
				<Paper sx={{ p: 3, mt: 3 }}>
					<Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>					<Box display="flex" alignItems="center" gap={2}>
						<MonetizationOn color="primary" />
						<Typography variant="h6">Savings Pocket Management</Typography>
					</Box>
						<Button
							variant="outlined"
							startIcon={<Savings />}
							onClick={() => setSavingsDialogOpen(true)}
						>
							Manage Savings Mappings
						</Button>
					</Box>
					<Alert severity="info">
						<Typography variant="body2">
							Map your savings categories to specific accounts to track your savings goals.
							This helps you understand which account holds money for each savings goal.
						</Typography>
					</Alert>
				</Paper>
			)}

			{/* Account Form Dialog */}
			<Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
				<DialogTitle>{editingAccount ? 'Edit Account' : 'Add Account'}</DialogTitle>
				<DialogContent>
					<Box sx={{ pt: 2 }}>
						<TextField
							fullWidth
							label="Account Name"
							value={formData.name}
							onChange={(e) => setFormData({ ...formData, name: e.target.value })}
							margin="normal"
							required
							placeholder="e.g., Main Checking, Emergency Savings"
						/>

						<FormControl fullWidth margin="normal" required>
							<InputLabel>Account Type</InputLabel>
							<Select
								value={formData.account_type}
								label="Account Type"
								onChange={(e) =>
									setFormData({ ...formData, account_type: e.target.value as Account['account_type'] })
								}>
								{Object.entries(accountTypeLabels).map(([value, label]) => (
									<MenuItem key={value} value={value}>
										<Box display="flex" alignItems="center" gap={1}>
											{accountTypeIcons[value as Account['account_type']]}
											{label}
										</Box>
									</MenuItem>
								))}
							</Select>
						</FormControl>

						<TextField
							fullWidth
							label="Institution"
							value={formData.institution}
							onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
							margin="normal"
							placeholder="e.g., ZKB, UBS, Cornercard"
						/>

						<TextField
							fullWidth
							label="Last 4 Digits"
							value={formData.account_number_last4}
							onChange={(e) => {
								const value = e.target.value.replace(/\D/g, '').slice(0, 4);
								setFormData({ ...formData, account_number_last4: value });
							}}
							margin="normal"
							placeholder="1234"
							inputProps={{ maxLength: 4 }}
						/>

						<TextField
							fullWidth
							label="Currency"
							value={formData.currency}
							onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
							margin="normal"
							placeholder="CHF"
							inputProps={{ maxLength: 3 }}
						/>

						<FormControlLabel
							control={
								<Switch
									checked={formData.is_default}
									onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
								/>
							}
							label="Set as default account"
							sx={{ mt: 2 }}
						/>
						{formData.is_default && (
							<Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 1 }}>
								New transactions will be assigned to this account by default
							</Typography>
						)}
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleClose}>Cancel</Button>
					<Button
						onClick={handleSubmit}
						variant="contained"
						disabled={!formData.name || createMutation.isPending || updateMutation.isPending}>
						{editingAccount ? 'Update' : 'Create'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* NEW: Balance Edit Dialog */}
			<BalanceEditDialog
				open={balanceEditOpen}
				onClose={handleCloseBalanceEdit}
				account={editingBalanceAccount}
			/>

			{/* NEW: Savings Account Mapping Dialog */}
			<SavingsAccountMappingDialog
				open={savingsDialogOpen}
				onClose={() => setSavingsDialogOpen(false)}
			/>
		</Box>
	);
}