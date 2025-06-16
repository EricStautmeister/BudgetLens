// frontend/src/components/BalanceEditDialog.tsx - Enhanced with historical balance setting

import React, { useState, useEffect } from 'react';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	TextField,
	FormControl,
	FormLabel,
	RadioGroup,
	FormControlLabel,
	Radio,
	Typography,
	Box,
	Alert,
	CircularProgress,
	Divider,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useSnackbar } from 'notistack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';

interface Account {
	id: string;
	name: string;
	balance: number;
	currency: string;
}

interface BalanceEditDialogProps {
	open: boolean;
	onClose: () => void;
	account: Account | null;
}

interface BalancePreview {
	account_name: string;
	as_of_date: string;
	current_balance_as_of_date: number;
	target_balance_as_of_date: number;
	adjustment_needed: number;
	transactions_after_date: number;
	transactions_after_amount: number;
	projected_current_balance: number;
	current_actual_balance: number;
}

export const BalanceEditDialog: React.FC<BalanceEditDialogProps> = ({
	open,
	onClose,
	account,
}) => {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [mode, setMode] = useState<'adjust' | 'set' | 'historical'>('set');
	const [amount, setAmount] = useState('');
	const [description, setDescription] = useState('');
	const [asOfDate, setAsOfDate] = useState<Date | null>(new Date());
	const [preview, setPreview] = useState<BalancePreview | null>(null);
	const [previewLoading, setPreviewLoading] = useState(false);

	// Load preview when historical mode is selected and we have an amount and date
	useEffect(() => {
		if (mode === 'historical' && account && amount && asOfDate) {
			const numericAmount = parseFloat(amount);
			if (!isNaN(numericAmount)) {
				loadPreview();
			}
		} else {
			setPreview(null);
		}
	}, [mode, amount, asOfDate, account]);

	const loadPreview = async () => {
		if (!account || !asOfDate || !amount) return;

		const numericAmount = parseFloat(amount);
		if (isNaN(numericAmount)) return;

		setPreviewLoading(true);
		try {
			// Send as ISO datetime string (with time at midnight)
			const dateStr = asOfDate.toISOString().split('T')[0] + 'T00:00:00';
			console.log('Loading preview with:', {
				new_balance: numericAmount,
				as_of_date: dateStr,
			});
			const response = await apiClient.previewAccountBalance(account.id, {
				new_balance: numericAmount,
				as_of_date: dateStr,
			});
			setPreview(response.data);
		} catch (error: any) {
			console.error('Failed to load preview:', error);
			console.error('Error response:', error.response?.data);
			enqueueSnackbar('Failed to load balance preview', { variant: 'warning' });
		} finally {
			setPreviewLoading(false);
		}
	};

	const adjustBalanceMutation = useMutation({
		mutationFn: async ({ accountId, data }: { accountId: string; data: any }) => {
			return apiClient.adjustAccountBalance(accountId, data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['accounts'] });
			enqueueSnackbar('Balance adjusted successfully', { variant: 'success' });
			handleClose();
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to adjust balance', {
				variant: 'error',
			});
		},
	});

	const setBalanceMutation = useMutation({
		mutationFn: async ({ accountId, data }: { accountId: string; data: any }) => {
			return apiClient.setAccountBalance(accountId, data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['accounts'] });
			enqueueSnackbar('Balance updated successfully', { variant: 'success' });
			handleClose();
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to update balance', {
				variant: 'error',
			});
		},
	});

	const handleClose = () => {
		setAmount('');
		setDescription('');
		setMode('set');
		setAsOfDate(new Date());
		setPreview(null);
		onClose();
	};

	const handleSubmit = () => {
		if (!account || !amount) return;

		const numericAmount = parseFloat(amount);
		if (isNaN(numericAmount)) {
			enqueueSnackbar('Please enter a valid amount', { variant: 'error' });
			return;
		}

		let data: any = {
			description: description || undefined,
		};

		console.log('Submitting with mode:', mode, 'amount:', numericAmount);

		if (mode === 'adjust') {
			data.amount = numericAmount;
			console.log('Adjust data:', data);
			adjustBalanceMutation.mutate({ accountId: account.id, data });
		} else if (mode === 'set') {
			data.new_balance = numericAmount;
			console.log('Set data:', data);
			setBalanceMutation.mutate({ accountId: account.id, data });
		} else if (mode === 'historical') {
			if (!asOfDate) {
				enqueueSnackbar('Please select a date', { variant: 'error' });
				return;
			}
			data.new_balance = numericAmount;
			// Send as ISO datetime string (with time at midnight)
			data.as_of_date = asOfDate.toISOString().split('T')[0] + 'T00:00:00';
			console.log('Historical data:', data);
			setBalanceMutation.mutate({ accountId: account.id, data });
		}
	};

	const formatCurrency = (value: number) => {
		return new Intl.NumberFormat('en-CH', {
			style: 'currency',
			currency: account?.currency || 'CHF',
		}).format(value);
	};

	const formatDate = (dateStr: string) => {
		return new Date(dateStr).toLocaleDateString('en-CH');
	};

	const getPreviewAmount = () => {
		if (!account || !amount) return null;
		const numericAmount = parseFloat(amount);
		if (isNaN(numericAmount)) return null;

		if (mode === 'adjust') {
			return account.balance + numericAmount;
		} else if (mode === 'set') {
			return numericAmount;
		}
		// For historical mode, we show the preview from the API
		return null;
	};

	const previewAmount = getPreviewAmount();

	return (
		<Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
			<DialogTitle>Edit Account Balance</DialogTitle>
			<DialogContent>
				{account && (
					<Box sx={{ pt: 2 }}>
						<Typography variant="body1" gutterBottom>
							<strong>{account.name}</strong>
						</Typography>
						<Typography variant="body2" color="textSecondary" gutterBottom>
							Current Balance: {formatCurrency(account.balance)}
						</Typography>

						<FormControl component="fieldset" sx={{ mt: 2, mb: 2 }}>
							<FormLabel component="legend">Action</FormLabel>
							<RadioGroup
								value={mode}
								onChange={(e) => setMode(e.target.value as 'adjust' | 'set' | 'historical')}>
								<FormControlLabel
									value="set"
									control={<Radio />}
									label="Set current balance to specific amount"
								/>
								<FormControlLabel
									value="adjust"
									control={<Radio />}
									label="Adjust current balance by amount"
								/>
								<FormControlLabel
									value="historical"
									control={<Radio />}
									label="Set balance as of a specific date"
								/>
							</RadioGroup>
						</FormControl>

						{mode === 'historical' && (
							<Box sx={{ mb: 2 }}>
								<DatePicker
									label="As of Date"
									value={asOfDate}
									onChange={(newValue) => setAsOfDate(newValue)}
									sx={{ mb: 2, width: '100%' }}
								/>
								<Alert severity="info" sx={{ mb: 2 }}>
									<Typography variant="body2">
										Set your account balance as of a specific date. The system will add all
										transactions after this date to calculate your current balance.
									</Typography>
								</Alert>
							</Box>
						)}

						<TextField
							fullWidth
							label={
								mode === 'adjust'
									? 'Adjustment Amount'
									: mode === 'historical'
										? 'Balance as of Selected Date'
										: 'New Balance'
							}
							type="number"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							margin="normal"
							required
							helperText={
								mode === 'adjust'
									? 'Positive to increase, negative to decrease'
									: mode === 'historical'
										? 'What was your bank balance on the selected date?'
										: 'Enter the new total balance'
							}
							inputProps={{
								step: '0.01',
							}}
						/>

						<TextField
							fullWidth
							label="Description (Optional)"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							margin="normal"
							placeholder="Reason for balance change"
							multiline
							rows={2}
						/>

						{/* Preview for non-historical modes */}
						{previewAmount !== null && mode !== 'historical' && (
							<Alert severity="info" sx={{ mt: 2 }}>
								<Typography variant="body2">
									New balance will be: {formatCurrency(previewAmount)}
									{mode === 'adjust' && (
										<span>
											{' '}
											({parseFloat(amount) >= 0 ? '+' : ''}
											{formatCurrency(parseFloat(amount))})
										</span>
									)}
								</Typography>
							</Alert>
						)}

						{/* Preview for historical mode */}
						{mode === 'historical' && (
							<Box sx={{ mt: 2 }}>
								{previewLoading && (
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
										<CircularProgress size={20} />
										<Typography variant="body2">Loading preview...</Typography>
									</Box>
								)}

								{preview && (
									<Alert severity="success" sx={{ mb: 2 }}>
										<Typography variant="subtitle2" gutterBottom>
											Balance Preview
										</Typography>
										<Typography variant="body2" component="div">
											<strong>As of {formatDate(preview.as_of_date)}:</strong> {formatCurrency(preview.target_balance_as_of_date)}
										</Typography>
										<Typography variant="body2" component="div">
											<strong>Transactions since then:</strong> {preview.transactions_after_date} transactions
											({formatCurrency(preview.transactions_after_amount)})
										</Typography>
										<Typography variant="body2" component="div">
											<strong>Current actual balance:</strong> {formatCurrency(preview.current_actual_balance)}
										</Typography>
										<Typography variant="body2" component="div">
											<strong>Projected current balance:</strong> {formatCurrency(preview.projected_current_balance)}
										</Typography>
										<Divider sx={{ my: 1 }} />
										<Typography variant="body2" component="div">
											<strong>Adjustment needed:</strong> {formatCurrency(preview.adjustment_needed)}
										</Typography>
									</Alert>
								)}
							</Box>
						)}
					</Box>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={handleClose}>Cancel</Button>
				<Button
					onClick={handleSubmit}
					variant="contained"
					disabled={
						!amount ||
						adjustBalanceMutation.isPending ||
						setBalanceMutation.isPending ||
						(mode === 'historical' && !asOfDate)
					}>
					{mode === 'adjust' ? 'Adjust Balance' : 'Set Balance'}
				</Button>
			</DialogActions>
		</Dialog>
	);
};