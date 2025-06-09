import React, { useState } from 'react';
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
	Select,
	MenuItem,
	FormControl,
	InputLabel,
	TextField,
	Chip,
	IconButton,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Checkbox,
	LinearProgress,
} from '@mui/material';
import { Check, Close, Category as CategoryIcon, Store } from '@mui/icons-material';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

export default function Review() {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
	const [learnDialog, setLearnDialog] = useState<any>(null);
	const [newVendorName, setNewVendorName] = useState('');

	const { data: transactions, isLoading } = useQuery({
		queryKey: ['reviewQueue'],
		queryFn: async () => {
			const response = await apiClient.getReviewQueue();
			return response.data;
		},
	});

	const { data: categories } = useQuery({
		queryKey: ['categories'],
		queryFn: async () => {
			const response = await apiClient.getCategories();
			return response.data;
		},
	});

	const { data: vendors } = useQuery({
		queryKey: ['vendors'],
		queryFn: async () => {
			const response = await apiClient.getVendors();
			return response.data;
		},
	});

	const categorizeMutation = useMutation({
		mutationFn: async ({ id, data }: any) => {
			return apiClient.categorizeTransaction(id, data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
			queryClient.invalidateQueries({ queryKey: ['transactions'] });
			enqueueSnackbar('Transaction categorized', { variant: 'success' });
		},
	});

	const bulkCategorizeMutation = useMutation({
		mutationFn: async ({ transactionIds, categoryId, vendorId }: any) => {
			return apiClient.bulkCategorize(transactionIds, categoryId, vendorId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
			queryClient.invalidateQueries({ queryKey: ['transactions'] });
			setSelectedTransactions([]);
			enqueueSnackbar('Transactions categorized', { variant: 'success' });
		},
	});

	const learnVendorMutation = useMutation({
		mutationFn: async ({ transactionId, vendorName, categoryId }: any) => {
			return apiClient.learnVendor(transactionId, vendorName, categoryId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
			queryClient.invalidateQueries({ queryKey: ['vendors'] });
			setLearnDialog(null);
			setNewVendorName('');
			enqueueSnackbar('Vendor learned successfully', { variant: 'success' });
		},
	});

	const handleSelectAll = () => {
		if (selectedTransactions.length === transactions?.length) {
			setSelectedTransactions([]);
		} else {
			setSelectedTransactions(transactions?.map((t: any) => t.id) || []);
		}
	};

	const handleSelectTransaction = (id: string) => {
		setSelectedTransactions((prev) => (prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id]));
	};

	const handleQuickCategorize = (transaction: any, categoryId: string, vendorId?: string) => {
		categorizeMutation.mutate({
			id: transaction.id,
			data: {
				category_id: categoryId,
				vendor_id: vendorId,
			},
		});
	};

	const handleLearnVendor = () => {
		if (learnDialog && newVendorName) {
			learnVendorMutation.mutate({
				transactionId: learnDialog.id,
				vendorName: newVendorName,
				categoryId: learnDialog.categoryId,
			});
		}
	};

	if (isLoading) {
		return <LinearProgress />;
	}

	return (
		<Box>
			<Typography variant="h4" gutterBottom>
				Review Transactions
			</Typography>

			{transactions?.length === 0 ? (
				<Paper sx={{ p: 3 }}>
					<Typography variant="body1" color="textSecondary" textAlign="center">
						No transactions need review! 🎉
					</Typography>
				</Paper>
			) : (
				<>
					{selectedTransactions.length > 0 && (
						<Paper sx={{ p: 2, mb: 2 }}>
							<Box display="flex" alignItems="center" gap={2}>
								<Typography variant="body1">{selectedTransactions.length} selected</Typography>
								<FormControl size="small" sx={{ minWidth: 200 }}>
									<InputLabel>Bulk Categorize</InputLabel>
									<Select
										label="Bulk Categorize"
										onChange={(e) => {
											if (e.target.value) {
												bulkCategorizeMutation.mutate({
													transactionIds: selectedTransactions,
													categoryId: e.target.value,
												});
											}
										}}>
										{categories?.map((cat: any) => (
											<MenuItem key={cat.id} value={cat.id}>
												{cat.name}
											</MenuItem>
										))}
									</Select>
								</FormControl>
							</Box>
						</Paper>
					)}

					<TableContainer component={Paper}>
						<Table>
							<TableHead>
								<TableRow>
									<TableCell padding="checkbox">
										<Checkbox
											checked={selectedTransactions.length === transactions?.length}
											indeterminate={
												selectedTransactions.length > 0 &&
												selectedTransactions.length < transactions?.length
											}
											onChange={handleSelectAll}
										/>
									</TableCell>
									<TableCell>Date</TableCell>
									<TableCell>Description</TableCell>
									<TableCell align="right">Amount</TableCell>
									<TableCell>Confidence</TableCell>
									<TableCell>Category</TableCell>
									<TableCell>Vendor</TableCell>
									<TableCell align="center">Actions</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{transactions?.map((transaction: any) => (
									<TableRow key={transaction.id}>
										<TableCell padding="checkbox">
											<Checkbox
												checked={selectedTransactions.includes(transaction.id)}
												onChange={() => handleSelectTransaction(transaction.id)}
											/>
										</TableCell>
										<TableCell>{format(new Date(transaction.date), 'MMM dd, yyyy')}</TableCell>
										<TableCell>{transaction.description}</TableCell>
										<TableCell align="right">
											${Math.abs(transaction.amount).toFixed(2)}
											{transaction.amount < 0 && (
												<Chip label="Debit" size="small" sx={{ ml: 1 }} />
											)}
										</TableCell>
										<TableCell>
											<Chip
												label={`${(transaction.confidence_score * 100).toFixed(0)}%`}
												size="small"
												color={transaction.confidence_score > 0.8 ? 'success' : 'warning'}
											/>
										</TableCell>
										<TableCell>
											<FormControl size="small" sx={{ minWidth: 150 }}>
												<Select
													value={transaction.category_id || ''}
													onChange={(e) =>
														handleQuickCategorize(transaction, e.target.value as string)
													}
													displayEmpty>
													<MenuItem value="">
														<em>Select category</em>
													</MenuItem>
													{categories?.map((cat: any) => (
														<MenuItem key={cat.id} value={cat.id}>
															{cat.name}
														</MenuItem>
													))}
												</Select>
											</FormControl>
										</TableCell>
										<TableCell>
											<FormControl size="small" sx={{ minWidth: 150 }}>
												<Select
													value={transaction.vendor_id || ''}
													onChange={(e) =>
														handleQuickCategorize(
															transaction,
															transaction.category_id,
															e.target.value as string
														)
													}
													displayEmpty>
													<MenuItem value="">
														<em>Select vendor</em>
													</MenuItem>
													{vendors?.map((vendor: any) => (
														<MenuItem key={vendor.id} value={vendor.id}>
															{vendor.name}
														</MenuItem>
													))}
												</Select>
											</FormControl>
										</TableCell>
										<TableCell align="center">
											<IconButton
												color="primary"
												onClick={() =>
													setLearnDialog({
														id: transaction.id,
														description: transaction.description,
														categoryId: transaction.category_id,
													})
												}
												disabled={!transaction.category_id}
												title="Learn vendor">
												<Store />
											</IconButton>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				</>
			)}

			{/* Learn Vendor Dialog */}
			<Dialog open={!!learnDialog} onClose={() => setLearnDialog(null)} maxWidth="sm" fullWidth>
				<DialogTitle>Learn New Vendor</DialogTitle>
				<DialogContent>
					<Typography variant="body2" color="textSecondary" gutterBottom>
						Transaction: {learnDialog?.description}
					</Typography>
					<TextField
						fullWidth
						label="Vendor Name"
						value={newVendorName}
						onChange={(e) => setNewVendorName(e.target.value)}
						sx={{ mt: 2 }}
						autoFocus
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setLearnDialog(null)}>Cancel</Button>
					<Button onClick={handleLearnVendor} variant="contained" disabled={!newVendorName}>
						Learn Vendor
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
