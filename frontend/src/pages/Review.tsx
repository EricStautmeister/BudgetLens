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
	Alert,
	Badge,
} from '@mui/material';
import { 
	Category as Store, 
	AutoFixHigh,
	Lightbulb,
	TrendingUp 
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

export default function Review() {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
	const [learnDialog, setLearnDialog] = useState<any>(null);
	const [newVendorName, setNewVendorName] = useState('');
	const [suggestionsDialog, setSuggestionsDialog] = useState<any>(null);
	const [learnPatterns, setLearnPatterns] = useState(true);

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

	const { data: suggestions } = useQuery({
		queryKey: ['vendorSuggestions', suggestionsDialog?.id],
		queryFn: async () => {
			if (!suggestionsDialog?.id) return null;
			const response = await apiClient.getVendorSuggestions(suggestionsDialog.id);
			return response.data;
		},
		enabled: !!suggestionsDialog?.id,
	});

	const categorizeMutation = useMutation({
		mutationFn: async ({ id, data, learnPatterns }: any) => {
			return apiClient.categorizeTransaction(id, data, learnPatterns);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
			queryClient.invalidateQueries({ queryKey: ['transactions'] });
			queryClient.invalidateQueries({ queryKey: ['vendors'] });
			
			if (data.data.similar_transactions_categorized && data.data.similar_transactions_categorized > 0) {
				enqueueSnackbar(
					`Transaction categorized! Also auto-categorized ${data.data.similar_transactions_categorized} similar transactions.`,
					{ variant: 'success' }
				);
			} else {
				enqueueSnackbar('Transaction categorized', { variant: 'success' });
			}
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
			learnPatterns: learnPatterns
		});
	};

	const handleSuggestionSelect = (suggestion: any) => {
		categorizeMutation.mutate({
			id: suggestionsDialog.id,
			data: {
				category_id: suggestion.category_id,
				vendor_id: suggestion.vendor_id,
			},
			learnPatterns: true
		});
		setSuggestionsDialog(null);
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

	const getNormalizedPattern = (description: string) => {
		// Client-side normalization preview (simplified)
		return description.toUpperCase().replace(/[^A-Z]/g, '');
	};

	const getExtractedVendor = (description: string) => {
		// Client-side vendor extraction (simplified)
		if (description.includes(',')) {
			const parts = description.split(',', 2);
			return parts[1].trim();
		}
		return description;
	};

	if (isLoading) {
		return <LinearProgress />;
	}

	return (
		<Box>
			<Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
				<Typography variant="h4">Review Transactions</Typography>
				<Box display="flex" alignItems="center" gap={2}>
					<FormControl size="small">
						<InputLabel>Learning Mode</InputLabel>
						<Select
							value={learnPatterns ? 'learn' : 'simple'}
							onChange={(e) => setLearnPatterns(e.target.value === 'learn')}
							label="Learning Mode">
							<MenuItem value="learn">
								<Box display="flex" alignItems="center" gap={1}>
									<AutoFixHigh fontSize="small" />
									Smart Learning
								</Box>
							</MenuItem>
							<MenuItem value="simple">Simple Mode</MenuItem>
						</Select>
					</FormControl>
				</Box>
			</Box>

			{learnPatterns && (
				<Alert severity="info" sx={{ mb: 2 }}>
					<Box display="flex" alignItems="center" gap={1}>
						<TrendingUp />
						<Typography variant="body2">
							Smart Learning is ON - When you categorize a transaction, similar ones will be automatically categorized!
						</Typography>
					</Box>
				</Alert>
			)}

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
										<TableCell>
											<Box>
												<Typography variant="body2">{transaction.description}</Typography>
												{learnPatterns && (
													<Typography variant="caption" color="textSecondary">
														Pattern: {getNormalizedPattern(transaction.description)}
													</Typography>
												)}
											</Box>
										</TableCell>
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
													setSuggestionsDialog({
														id: transaction.id,
														description: transaction.description,
													})
												}
												title="Get AI suggestions">
												<Badge 
													badgeContent="AI" 
													color="secondary" 
													sx={{ '& .MuiBadge-badge': { fontSize: '9px', minWidth: '16px', height: '16px' } }}
												>
													<Lightbulb />
												</Badge>
											</IconButton>
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

			{/* AI Suggestions Dialog */}
			<Dialog open={!!suggestionsDialog} onClose={() => setSuggestionsDialog(null)} maxWidth="md" fullWidth>
				<DialogTitle>Smart Vendor Suggestions</DialogTitle>
				<DialogContent>
					<Box sx={{ mb: 2 }}>
						<Typography variant="body2" color="textSecondary">
							Transaction: {suggestionsDialog?.description}
						</Typography>
						{suggestionsDialog?.description && (
							<Typography variant="caption" color="primary">
								Extracted vendor: {getExtractedVendor(suggestionsDialog.description)}
							</Typography>
						)}
					</Box>
					{suggestions?.suggestions?.length > 0 ? (
						<Box sx={{ mt: 2 }}>
							{suggestions.suggestions.map((suggestion: any, index: number) => (
								<Paper 
									key={index} 
									sx={{ p: 2, mb: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
									onClick={() => handleSuggestionSelect(suggestion)}
								>
									<Box display="flex" justifyContent="space-between" alignItems="center">
										<Box>
											<Typography variant="subtitle1">{suggestion.vendor_name}</Typography>
											<Typography variant="caption" color="textSecondary">
												Learned pattern: {suggestion.matching_pattern}
											</Typography>
											<br />
											<Typography variant="caption" color="textSecondary">
												Your pattern: {suggestion.normalized_pattern}
											</Typography>
										</Box>
										<Chip 
											label={`${(suggestion.similarity * 100).toFixed(0)}% match`}
											color={suggestion.similarity > 0.8 ? 'success' : 'primary'}
											size="small"
										/>
									</Box>
								</Paper>
							))}
						</Box>
					) : (
						<Alert severity="info">
							No similar vendors found. This will create a new vendor pattern when categorized.
						</Alert>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setSuggestionsDialog(null)}>Close</Button>
				</DialogActions>
			</Dialog>

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