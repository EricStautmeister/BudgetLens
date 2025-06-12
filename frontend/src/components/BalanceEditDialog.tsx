// frontend/src/components/BalanceEditDialog.tsx

import React, { useState } from 'react';
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
} from '@mui/material';
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

export const BalanceEditDialog: React.FC<BalanceEditDialogProps> = ({
	open,
	onClose,
	account,
}) => {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [mode, setMode] = useState<'adjust' | 'set'>('set');
	const [amount, setAmount] = useState('');
	const [description, setDescription] = useState('');

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
		onClose();
	};

	const handleSubmit = () => {
		if (!account || !amount) return;

		const numericAmount = parseFloat(amount);
		if (isNaN(numericAmount)) {
			enqueueSnackbar('Please enter a valid amount', { variant: 'error' });
			return;
		}

		const data = {
			[mode === 'adjust' ? 'amount' : 'new_balance']: numericAmount,
			description: description || undefined,
		};

		if (mode === 'adjust') {
			adjustBalanceMutation.mutate({ accountId: account.id, data });
		} else {
			setBalanceMutation.mutate({ accountId: account.id, data });
		}
	};

	const formatCurrency = (value: number) => {
		return new Intl.NumberFormat('en-CH', {
			style: 'currency',
			currency: account?.currency || 'CHF',
		}).format(value);
	};

	const getPreviewAmount = () => {
		if (!account || !amount) return null;
		const numericAmount = parseFloat(amount);
		if (isNaN(numericAmount)) return null;

		if (mode === 'adjust') {
			return account.balance + numericAmount;
		} else {
			return numericAmount;
		}
	};

	const previewAmount = getPreviewAmount();

	return (
		<Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
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
								onChange={(e) => setMode(e.target.value as 'adjust' | 'set')}>
								<FormControlLabel
									value="set"
									control={<Radio />}
									label="Set balance to specific amount"
								/>
								<FormControlLabel
									value="adjust"
									control={<Radio />}
									label="Adjust balance by amount"
								/>
							</RadioGroup>
						</FormControl>

						<TextField
							fullWidth
							label={mode === 'adjust' ? 'Adjustment Amount' : 'New Balance'}
							type="number"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							margin="normal"
							required
							helperText={
								mode === 'adjust'
									? 'Positive to increase, negative to decrease'
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

						{previewAmount !== null && (
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
						setBalanceMutation.isPending
					}>
					{mode === 'adjust' ? 'Adjust Balance' : 'Set Balance'}
				</Button>
			</DialogActions>
		</Dialog>
	);
};