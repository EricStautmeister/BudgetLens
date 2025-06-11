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
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Alert,
	Card,
	CardContent,
	Grid
} from '@mui/material';
import {
	Delete,
	Refresh,
	Visibility,
	CloudUpload,
	CheckCircle,
	Error as ErrorIcon,
	Warning,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

export default function UploadManagement() {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [deleteDialog, setDeleteDialog] = useState<any>(null);
	const [viewTransactionsDialog, setViewTransactionsDialog] = useState<any>(null);

	const { data: uploads, isLoading } = useQuery({
		queryKey: ['uploads'],
		queryFn: async () => {
			const response = await apiClient.getUploads();
			return response.data;
		},
	});

	const { data: stats } = useQuery({
		queryKey: ['uploadStats'],
		queryFn: async () => {
			const response = await apiClient.getUploadStats();
			return response.data;
		},
	});

	const { data: transactions } = useQuery({
		queryKey: ['uploadTransactions', viewTransactionsDialog?.id],
		queryFn: async () => {
			if (!viewTransactionsDialog?.id) return null;
			const response = await apiClient.getUploadTransactions(viewTransactionsDialog.id);
			return response.data;
		},
		enabled: !!viewTransactionsDialog?.id,
	});

	const deleteMutation = useMutation({
		mutationFn: async (uploadId: string) => {
			return apiClient.deleteUpload(uploadId);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ['uploads'] });
			queryClient.invalidateQueries({ queryKey: ['uploadStats'] });
			queryClient.invalidateQueries({ queryKey: ['transactions'] });
			queryClient.invalidateQueries({ queryKey: ['currentBudget'] });
			enqueueSnackbar(
				`Deleted upload and ${data.data.deleted_transactions} transactions`,
				{ variant: 'success' }
			);
			setDeleteDialog(null);
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Delete failed', { variant: 'error' });
		},
	});

	const retryMutation = useMutation({
		mutationFn: async (uploadId: string) => {
			return apiClient.retryFailedUpload(uploadId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['uploads'] });
			enqueueSnackbar('Upload reset for retry', { variant: 'success' });
		},
	});

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'completed':
				return <CheckCircle color="success" />;
			case 'failed':
				return <ErrorIcon color="error" />;
			case 'processing':
				return <CloudUpload color="primary" />;
			default:
				return <Warning color="warning" />;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'completed':
				return 'success';
			case 'failed':
				return 'error';
			case 'processing':
				return 'primary';
			default:
				return 'default';
		}
	};

	if (isLoading) {
		return <Typography>Loading...</Typography>;
	}

	return (
		<Box>
			<Typography variant="h4" gutterBottom>
				Upload Management
			</Typography>

			{/* Stats Cards */}
			{stats && (
				<Grid container spacing={3} sx={{ mb: 3 }}>
					<Grid item xs={12} md={3}>
						<Card>
							<CardContent>
								<Typography color="textSecondary" gutterBottom>
									Total Uploads
								</Typography>
								<Typography variant="h5">{stats.total_uploads}</Typography>
							</CardContent>
						</Card>
					</Grid>
					<Grid item xs={12} md={3}>
						<Card>
							<CardContent>
								<Typography color="textSecondary" gutterBottom>
									Successful
								</Typography>
								<Typography variant="h5" color="success.main">
									{stats.successful_uploads}
								</Typography>
							</CardContent>
						</Card>
					</Grid>
					<Grid item xs={12} md={3}>
						<Card>
							<CardContent>
								<Typography color="textSecondary" gutterBottom>
									Failed
								</Typography>
								<Typography variant="h5" color="error.main">
									{stats.failed_uploads}
								</Typography>
							</CardContent>
						</Card>
					</Grid>
					<Grid item xs={12} md={3}>
						<Card>
							<CardContent>
								<Typography color="textSecondary" gutterBottom>
									Total Transactions
								</Typography>
								<Typography variant="h5">{stats.total_transactions}</Typography>
							</CardContent>
						</Card>
					</Grid>
				</Grid>
			)}

			{/* Uploads Table */}
			<TableContainer component={Paper}>
				<Table>
					<TableHead>
						<TableRow>
							<TableCell>Status</TableCell>
							<TableCell>Filename</TableCell>
							<TableCell>Upload Date</TableCell>
							<TableCell align="right">Processed</TableCell>
							<TableCell align="right">Errors</TableCell>
							<TableCell align="center">Actions</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{uploads?.map((upload: any) => (
							<TableRow key={upload.id}>
								<TableCell>
									<Box display="flex" alignItems="center" gap={1}>
										{getStatusIcon(upload.status)}
										<Chip
											label={upload.status}
											size="small"
											color={getStatusColor(upload.status) as any}
										/>
									</Box>
								</TableCell>
								<TableCell>
									<Box>
										<Typography variant="body2">{upload.filename}</Typography>
										{upload.error_details?.summary && (
											<Typography variant="caption" color="textSecondary">
												{upload.error_details.summary.processed} of{' '}
												{upload.error_details.summary.total_rows} rows
											</Typography>
										)}
									</Box>
								</TableCell>
								<TableCell>
									{format(new Date(upload.created_at), 'MMM dd, yyyy HH:mm')}
								</TableCell>
								<TableCell align="right">{upload.processed_rows || 0}</TableCell>
								<TableCell align="right">
									{upload.error_count > 0 ? (
										<Chip label={upload.error_count} color="error" size="small" />
									) : (
										0
									)}
								</TableCell>
								<TableCell align="center">
									<IconButton
										onClick={() =>
											setViewTransactionsDialog({ id: upload.id, filename: upload.filename })
										}
										title="View transactions">
										<Visibility />
									</IconButton>
									{upload.status === 'failed' && (
										<IconButton
											onClick={() => retryMutation.mutate(upload.id)}
											title="Retry upload">
											<Refresh />
										</IconButton>
									)}
									<IconButton
										onClick={() => setDeleteDialog(upload)}
										color="error"
										title="Delete upload and transactions">
										<Delete />
									</IconButton>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</TableContainer>

			{uploads?.length === 0 && (
				<Paper sx={{ p: 3, textAlign: 'center' }}>
					<Typography variant="body1" color="textSecondary">
						No uploads found. Upload your first CSV file to get started!
					</Typography>
				</Paper>
			)}

			{/* Delete Confirmation Dialog */}
			<Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="sm" fullWidth>
				<DialogTitle>Delete Upload</DialogTitle>
				<DialogContent>
					<Alert severity="warning" sx={{ mb: 2 }}>
						This will permanently delete the upload and ALL associated transactions. This action
						cannot be undone.
					</Alert>
					<Typography>
						Are you sure you want to delete <strong>{deleteDialog?.filename}</strong>?
					</Typography>
					<Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
						This upload contains {deleteDialog?.processed_rows} transactions that will be removed
						from your account.
					</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
					<Button
						onClick={() => deleteMutation.mutate(deleteDialog.id)}
						color="error"
						variant="contained"
						disabled={deleteMutation.isPending}>
						{deleteMutation.isPending ? 'Deleting...' : 'Delete'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* View Transactions Dialog */}
			<Dialog
				open={!!viewTransactionsDialog}
				onClose={() => setViewTransactionsDialog(null)}
				maxWidth="md"
				fullWidth>
				<DialogTitle>Transactions from {viewTransactionsDialog?.filename}</DialogTitle>
				<DialogContent>
					{transactions && (
						<>
							<Typography variant="body2" color="textSecondary" gutterBottom>
								{transactions.transactions.length} transactions found
							</Typography>
							<TableContainer sx={{ maxHeight: 400 }}>
								<Table stickyHeader size="small">
									<TableHead>
										<TableRow>
											<TableCell>Date</TableCell>
											<TableCell>Description</TableCell>
											<TableCell align="right">Amount</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{transactions.transactions.map((transaction: any) => (
											<TableRow key={transaction.id}>
												<TableCell>
													{format(new Date(transaction.date), 'MMM dd, yyyy')}
												</TableCell>
												<TableCell>{transaction.description}</TableCell>
												<TableCell align="right">
													${Math.abs(transaction.amount).toFixed(2)}
													{transaction.amount < 0 && (
														<Chip label="Debit" size="small" sx={{ ml: 1 }} />
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</TableContainer>
						</>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setViewTransactionsDialog(null)}>Close</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}