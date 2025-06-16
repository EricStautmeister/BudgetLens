// frontend/src/pages/Transfers.tsx - Fixed data extraction

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
	Chip,
	Card,
	CardContent,
	Grid,
	Alert,
	Accordion,
	AccordionSummary,
	AccordionDetails,
	LinearProgress,
	Tooltip,
} from '@mui/material';
import {
	SwapHoriz,
	AutoFixHigh,
	Delete,
	CheckCircle,
	ExpandMore,
	Psychology,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

interface Transfer {
	id: string;
	from_account_id: string;
	to_account_id: string;
	amount: number;
	date: string;
	description: string;
	is_confirmed: boolean;
	created_at: string;
	from_account_name: string;
	to_account_name: string;
}

interface PotentialTransfer {
	from_transaction: {
		id: string;
		date: string;
		amount: number;
		description: string;
		account_id: string;
	};
	to_transaction: {
		id: string;
		date: string;
		amount: number;
		description: string;
		account_id: string;
	};
	confidence: number;
	amount: number;
	date_difference: number;
}

interface TransferDetectionResult {
	potential_transfers: PotentialTransfer[];
	auto_matched: number;
	manual_review_needed: number;
}

export default function Transfers() {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [detectionResults, setDetectionResults] = useState<TransferDetectionResult | null>(null);
	const [isDetecting, setIsDetecting] = useState(false);
	const [, setSelectedTransfer] = useState<PotentialTransfer | null>(null);

	// FIXED: Extract transfers array from response object
	const { data: transfers, isLoading } = useQuery<Transfer[]>({
		queryKey: ['transfers'],
		queryFn: async () => {
			const response = await apiClient.getTransfers();
			return response.data.transfers;  // ✅ This returns the actual array
		},
	});

	const { data: accounts } = useQuery({
		queryKey: ['accounts'],
		queryFn: async () => {
			const response = await apiClient.getAccounts();
			return response.data;
		},
	});

	const detectTransfersMutation = useMutation({
		mutationFn: async (daysLookback: number = 7) => {
			return apiClient.detectTransfers(daysLookback);
		},
		onSuccess: (data) => {
			setDetectionResults(data.data);
			enqueueSnackbar(
				`Found ${data.data.potential_transfers.length} potential transfers. ${data.data.auto_matched} auto-matched.`,
				{ variant: 'info' }
			);
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Transfer detection failed', { variant: 'error' });
		},
	});

	const createTransferMutation = useMutation({
		mutationFn: async (data: { from_transaction_id: string; to_transaction_id: string; amount: number }) => {
			return apiClient.createManualTransfer(data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['transfers'] });
			queryClient.invalidateQueries({ queryKey: ['transactions'] });
			enqueueSnackbar('Transfer created successfully', { variant: 'success' });
			setSelectedTransfer(null);
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to create transfer', { variant: 'error' });
		},
	});

	const deleteTransferMutation = useMutation({
		mutationFn: async (id: string) => {
			return apiClient.deleteTransfer(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['transfers'] });
			queryClient.invalidateQueries({ queryKey: ['transactions'] });
			enqueueSnackbar('Transfer deleted successfully', { variant: 'success' });
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Delete failed', { variant: 'error' });
		},
	});

	const handleDetectTransfers = () => {
		setIsDetecting(true);
		detectTransfersMutation.mutate(7);
		setTimeout(() => setIsDetecting(false), 2000);
	};

	const handleCreateTransfer = (transfer: PotentialTransfer) => {
		createTransferMutation.mutate({
			from_transaction_id: transfer.from_transaction.id,
			to_transaction_id: transfer.to_transaction.id,
			amount: transfer.amount,
		});
	};

	const getConfidenceColor = (confidence: number) => {
		if (confidence >= 0.8) return 'success';
		if (confidence >= 0.6) return 'warning';
		return 'error';
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat('en-CH', {
			style: 'currency',
			currency: 'CHF',
		}).format(amount);
	};

	const getAccountName = (accountId: string) => {
		const account = accounts?.find((acc: any) => acc.id === accountId);
		return account?.name || 'Unknown Account';
	};

	if (isLoading) {
		return <LinearProgress />;
	}

	return (
		<Box>
			<Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
				<Box display="flex" alignItems="center" gap={2}>
					<SwapHoriz color="primary" />
					<Typography variant="h4">Transfer Management</Typography>
				</Box>
				<Button
					variant="contained"
					startIcon={<Psychology />}
					onClick={handleDetectTransfers}
					disabled={isDetecting || detectTransfersMutation.isPending}>
					{isDetecting ? 'Detecting...' : 'Detect Transfers'}
				</Button>
			</Box>

			<Alert severity="info" sx={{ mb: 3 }}>
				<Typography variant="body2">
					Transfers between your accounts are automatically detected and matched to avoid double-counting.
					Use the detection tool to find potential transfers that need manual review.
				</Typography>
			</Alert>

			{/* Summary Cards */}
			<Grid container spacing={3} sx={{ mb: 3 }}>
				<Grid item xs={12} md={4}>
					<Card>
						<CardContent>
							<Typography color="textSecondary" gutterBottom>
								Total Transfers
							</Typography>
							<Typography variant="h4">{transfers?.length || 0}</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={4}>
					<Card>
						<CardContent>
							<Typography color="textSecondary" gutterBottom>
								Auto-Matched
							</Typography>
							<Typography variant="h4" color="success.main">
								{detectionResults?.auto_matched || 0}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={4}>
					<Card>
						<CardContent>
							<Typography color="textSecondary" gutterBottom>
								Need Review
							</Typography>
							<Typography variant="h4" color="warning.main">
								{detectionResults?.manual_review_needed || 0}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
			</Grid>

			{/* Detection Results */}
			{detectionResults && detectionResults.potential_transfers && detectionResults.potential_transfers.length > 0 && (
				<Paper sx={{ p: 3, mb: 3 }}>
					<Typography variant="h6" gutterBottom>
						<AutoFixHigh sx={{ mr: 1 }} />
						Potential Transfers Found
					</Typography>

					{detectionResults.potential_transfers.map((transfer, index) => (
						<Accordion key={index}>
							<AccordionSummary expandIcon={<ExpandMore />}>
								<Box display="flex" alignItems="center" gap={2} width="100%">
									<Chip
										label={`${(transfer.confidence * 100).toFixed(0)}% match`}
										color={getConfidenceColor(transfer.confidence) as any}
										size="small"
									/>
									<Typography variant="body1">
										{formatCurrency(transfer.amount)} • {getAccountName(transfer.from_transaction.account_id)} →{' '}
										{getAccountName(transfer.to_transaction.account_id)}
									</Typography>
									<Typography variant="body2" color="textSecondary" sx={{ ml: 'auto' }}>
										{transfer.date_difference === 0
											? 'Same day'
											: `${transfer.date_difference} day${transfer.date_difference > 1 ? 's' : ''} apart`}
									</Typography>
								</Box>
							</AccordionSummary>
							<AccordionDetails>
								<Grid container spacing={2}>
									<Grid item xs={12} md={5}>
										<Paper variant="outlined" sx={{ p: 2 }}>
											<Typography variant="subtitle2" color="error">
												From Account
											</Typography>
											<Typography variant="body2" fontWeight="bold">
												{getAccountName(transfer.from_transaction.account_id)}
											</Typography>
											<Typography variant="body2">
												{format(new Date(transfer.from_transaction.date), 'MMM dd, yyyy')}
											</Typography>
											<Typography variant="caption" display="block">
												{transfer.from_transaction.description}
											</Typography>
											<Typography variant="body1" color="error" fontWeight="bold">
												-{formatCurrency(Math.abs(transfer.from_transaction.amount))}
											</Typography>
										</Paper>
									</Grid>
									<Grid item xs={12} md={2} display="flex" alignItems="center" justifyContent="center">
										<SwapHoriz color="primary" />
									</Grid>
									<Grid item xs={12} md={5}>
										<Paper variant="outlined" sx={{ p: 2 }}>
											<Typography variant="subtitle2" color="success">
												To Account
											</Typography>
											<Typography variant="body2" fontWeight="bold">
												{getAccountName(transfer.to_transaction.account_id)}
											</Typography>
											<Typography variant="body2">
												{format(new Date(transfer.to_transaction.date), 'MMM dd, yyyy')}
											</Typography>
											<Typography variant="caption" display="block">
												{transfer.to_transaction.description}
											</Typography>
											<Typography variant="body1" color="success" fontWeight="bold">
												+{formatCurrency(Math.abs(transfer.to_transaction.amount))}
											</Typography>
										</Paper>
									</Grid>
								</Grid>
								<Box display="flex" justifyContent="center" mt={2}>
									<Button
										variant="contained"
										startIcon={<CheckCircle />}
										onClick={() => handleCreateTransfer(transfer)}
										disabled={createTransferMutation.isPending}>
										Confirm Transfer
									</Button>
								</Box>
							</AccordionDetails>
						</Accordion>
					))}
				</Paper>
			)}

			{/* Existing Transfers */}
			<Paper sx={{ mb: 3 }}>
				<Typography variant="h6" sx={{ p: 3, pb: 0 }}>
					Confirmed Transfers
				</Typography>
				<TableContainer>
					<Table>
						<TableHead>
							<TableRow>
								<TableCell>Date</TableCell>
								<TableCell>From Account</TableCell>
								<TableCell>To Account</TableCell>
								<TableCell align="right">Amount</TableCell>
								<TableCell>Description</TableCell>
								<TableCell>Status</TableCell>
								<TableCell align="center">Actions</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{/* FIXED: Now using the extracted transfers array */}
							{transfers && transfers.map && transfers.map((transfer: Transfer) => (
								<TableRow key={transfer.id}>
									<TableCell>{format(new Date(transfer.date), 'MMM dd, yyyy')}</TableCell>
									<TableCell>{transfer.from_account_name}</TableCell>
									<TableCell>{transfer.to_account_name}</TableCell>
									<TableCell align="right">{formatCurrency(transfer.amount)}</TableCell>
									<TableCell>
										<Typography variant="body2" noWrap>
											{transfer.description || '-'}
										</Typography>
									</TableCell>
									<TableCell>
										{transfer.is_confirmed ? (
											<Chip label="Confirmed" color="success" size="small" />
										) : (
											<Chip label="Pending" color="warning" size="small" />
										)}
									</TableCell>
									<TableCell align="center">
										<Tooltip title="Delete transfer">
											<IconButton
												onClick={() => {
													if (confirm('Delete this transfer? Associated transactions will be unmarked.')) {
														deleteTransferMutation.mutate(transfer.id);
													}
												}}
												size="small"
												color="error">
												<Delete />
											</IconButton>
										</Tooltip>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>

				{/* FIXED: Check the actual transfers array */}
				{(!transfers || transfers.length === 0) && (
					<Box p={3} textAlign="center">
						<SwapHoriz sx={{ fontSize: 48, color: 'action.disabled', mb: 2 }} />
						<Typography variant="h6" color="textSecondary" gutterBottom>
							No transfers found
						</Typography>
						<Typography variant="body2" color="textSecondary">
							Use the "Detect Transfers" button to automatically find transfers between your accounts.
						</Typography>
					</Box>
				)}
			</Paper>

			{/* How It Works */}
			<Paper sx={{ p: 3 }}>
				<Typography variant="h6" gutterBottom>
					How Transfer Detection Works
				</Typography>
				<Grid container spacing={2}>
					<Grid item xs={12} md={6}>
						<Box display="flex" alignItems="center" gap={1} mb={1}>
							<CheckCircle color="success" fontSize="small" />
							<Typography variant="body2">
								<strong>Amount Matching:</strong> Finds transactions with opposite amounts (one negative, one positive)
							</Typography>
						</Box>
						<Box display="flex" alignItems="center" gap={1} mb={1}>
							<CheckCircle color="success" fontSize="small" />
							<Typography variant="body2">
								<strong>Date Proximity:</strong> Matches transactions within 3 days of each other
							</Typography>
						</Box>
					</Grid>
					<Grid item xs={12} md={6}>
						<Box display="flex" alignItems="center" gap={1} mb={1}>
							<CheckCircle color="success" fontSize="small" />
							<Typography variant="body2">
								<strong>Account Separation:</strong> Only matches transactions from different accounts
							</Typography>
						</Box>
						<Box display="flex" alignItems="center" gap={1} mb={1}>
							<CheckCircle color="success" fontSize="small" />
							<Typography variant="body2">
								<strong>Confidence Scoring:</strong> High-confidence matches (90%+) are auto-confirmed
							</Typography>
						</Box>
					</Grid>
				</Grid>
			</Paper>
		</Box>
	);
}