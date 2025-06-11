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
	Grid,
	Tooltip,
	Stack
} from '@mui/material';
import {
	Delete,
	Refresh,
	Visibility,
	CloudUpload,
	CheckCircle,
	Error as ErrorIcon,
	Warning,
	InsertDriveFile,
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

	const getFileExtension = (filename: string) => {
		const ext = filename.split('.').pop()?.toLowerCase();
		return ext || 'unknown';
	};

	const getFileDisplayName = (filename: string) => {
		// Truncate very long filenames for display
		if (filename.length > 40) {
			const ext = filename.split('.').pop();
			const name = filename.substring(0, filename.lastIndexOf('.'));
			return `${name.substring(0, 35)}...${ext}`;
		}
		return filename;
	};

	// const formatFileSize = (bytes: number) => {
	// 	if (bytes === 0) return '0 B';
	// 	const k = 1024;
	// 	const sizes = ['B', 'KB', 'MB', 'GB'];
	// 	const i = Math.floor(Math.log(bytes) / Math.log(k));
	// 	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	// };

	if (isLoading) {
		return <Typography>Loading...</Typography>;
	}

	return (
		<Box>
			<Box display="flex" alignItems="center" gap={2} mb={3}>
				<InsertDriveFile color="primary" />
				<Typography variant="h4">Upload Management</Typography>
			</Box>

			<Alert severity="info" sx={{ mb: 3 }}>
				<Typography variant="body2">
					Manage your uploaded bank statements and CSV files. All original filenames are preserved to help you identify your uploads.
				</Typography>
			</Alert>

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
							<TableCell>Original Filename</TableCell>
							<TableCell>Upload Date</TableCell>
							<TableCell align="right">Processing Results</TableCell>
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
										<Stack direction="row" alignItems="center" spacing={1}>
											<InsertDriveFile 
												fontSize="small" 
												color={upload.status === 'completed' ? 'success' : 'action'} 
											/>
											<Box>
												<Tooltip title={upload.filename} arrow>
													<Typography variant="body2" fontWeight="medium">
														{getFileDisplayName(upload.filename)}
													</Typography>
												</Tooltip>
												<Typography variant="caption" color="textSecondary">
													{getFileExtension(upload.filename).toUpperCase()} file
													{upload.error_details?.summary && (
														<> • {upload.error_details.summary.processed} of{' '}
														{upload.error_details.summary.total_rows} rows processed</>
													)}
												</Typography>
											</Box>
										</Stack>
									</Box>
								</TableCell>
								<TableCell>
									<Box>
										<Typography variant="body2">
											{format(new Date(upload.created_at), 'MMM dd, yyyy')}
										</Typography>
										<Typography variant="caption" color="textSecondary">
											{format(new Date(upload.created_at), 'HH:mm:ss')}
										</Typography>
									</Box>
								</TableCell>
								<TableCell align="right">
									<Box display="flex" flexDirection="column" alignItems="flex-end" gap={0.5}>
										{upload.status === 'completed' && (
											<Chip 
												label={`${upload.processed_rows || 0} processed`} 
												color="success" 
												size="small" 
											/>
										)}
										{upload.error_count > 0 && (
											<Chip 
												label={`${upload.error_count} errors`} 
												color="error" 
												size="small" 
											/>
										)}
										{upload.error_details?.summary?.skipped > 0 && (
											<Chip 
												label={`${upload.error_details.summary.skipped} skipped`} 
												color="warning" 
												size="small" 
											/>
										)}
									</Box>
								</TableCell>
								<TableCell align="center">
									<Box display="flex" justifyContent="center">
										<Tooltip title="View transactions from this upload">
											<IconButton
												onClick={() =>
													setViewTransactionsDialog({ 
														id: upload.id, 
														filename: upload.filename 
													})
												}
												size="small">
												<Visibility />
											</IconButton>
										</Tooltip>
										{upload.status === 'failed' && (
											<Tooltip title="Retry failed upload">
												<IconButton
													onClick={() => retryMutation.mutate(upload.id)}
													size="small"
													color="primary">
													<Refresh />
												</IconButton>
											</Tooltip>
										)}
										<Tooltip title="Delete upload and all transactions">
											<IconButton
												onClick={() => setDeleteDialog(upload)}
												color="error"
												size="small">
												<Delete />
											</IconButton>
										</Tooltip>
									</Box>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</TableContainer>

			{uploads?.length === 0 && (
				<Paper sx={{ p: 3, textAlign: 'center' }}>
					<InsertDriveFile sx={{ fontSize: 48, color: 'action.disabled', mb: 2 }} />
					<Typography variant="h6" color="textSecondary" gutterBottom>
						No uploads found
					</Typography>
					<Typography variant="body2" color="textSecondary">
						Upload your first CSV file to get started! All original filenames will be preserved.
					</Typography>
				</Paper>
			)}

			{/* Delete Confirmation Dialog */}
			<Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="sm" fullWidth>
				<DialogTitle>
					<Box display="flex" alignItems="center" gap={1}>
						<Warning color="error" />
						Delete Upload
					</Box>
				</DialogTitle>
				<DialogContent>
					<Alert severity="warning" sx={{ mb: 2 }}>
						This will permanently delete the upload and ALL associated transactions. This action
						cannot be undone.
					</Alert>
					<Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 2 }}>
						<Typography variant="subtitle2" gutterBottom>
							File to delete:
						</Typography>
						<Typography variant="body1" fontWeight="medium">
							{deleteDialog?.filename}
						</Typography>
					</Box>
					<Typography variant="body2" color="textSecondary">
						This upload contains {deleteDialog?.processed_rows || 0} transactions that will be removed
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
						{deleteMutation.isPending ? 'Deleting...' : 'Delete Upload'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* View Transactions Dialog */}
			<Dialog
				open={!!viewTransactionsDialog}
				onClose={() => setViewTransactionsDialog(null)}
				maxWidth="md"
				fullWidth>
				<DialogTitle>
					<Box display="flex" alignItems="center" gap={1}>
						<InsertDriveFile />
						<Box>
							<Typography variant="h6">
								Transactions from Upload
							</Typography>
							<Typography variant="body2" color="textSecondary">
								{viewTransactionsDialog?.filename}
							</Typography>
						</Box>
					</Box>
				</DialogTitle>
				<DialogContent>
					{transactions && (
						<>
							<Alert severity="info" sx={{ mb: 2 }}>
								<Typography variant="body2">
									Found {transactions.transactions.length} transactions from this upload.
									All transactions shown below were imported from the original file:
									<strong> {viewTransactionsDialog?.filename}</strong>
								</Typography>
							</Alert>
							<TableContainer sx={{ maxHeight: 400 }}>
								<Table stickyHeader size="small">
									<TableHead>
										<TableRow>
											<TableCell>Date</TableCell>
											<TableCell>Description</TableCell>
											<TableCell align="right">Amount</TableCell>
											<TableCell>Import Time</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{transactions.transactions.map((transaction: any) => (
											<TableRow key={transaction.id}>
												<TableCell>
													{format(new Date(transaction.date), 'MMM dd, yyyy')}
												</TableCell>
												<TableCell>
													<Typography variant="body2" noWrap>
														{transaction.description}
													</Typography>
												</TableCell>
												<TableCell align="right">
													<Box display="flex" alignItems="center" justifyContent="flex-end" gap={1}>
														<Typography variant="body2">
															${Math.abs(transaction.amount).toFixed(2)}
														</Typography>
														{transaction.amount < 0 && (
															<Chip label="Debit" size="small" color="default" />
														)}
													</Box>
												</TableCell>
												<TableCell>
													<Typography variant="caption" color="textSecondary">
														{format(new Date(transaction.created_at), 'HH:mm:ss')}
													</Typography>
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