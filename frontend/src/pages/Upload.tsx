import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
	Box,
	Paper,
	Typography,
	Button,
	LinearProgress,
	Alert,
	Select,
	MenuItem,
	FormControl,
	InputLabel,
	Chip,
	Accordion,
	AccordionSummary,
	AccordionDetails,
	Stack,
	Divider,
	Grid,
} from '@mui/material';
import { 
	CloudUpload, 
	CheckCircle, 
	Error as ErrorIcon,  
	ExpandMore,
	InsertDriveFile,
	Security,
	Visibility,
	AccountBalance,
	Add,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

export default function Upload() {
	const { enqueueSnackbar } = useSnackbar();
	const [selectedMapping, setSelectedMapping] = useState<string>('');
	const [selectedAccount, setSelectedAccount] = useState<string>('');
	const [uploadStatus, setUploadStatus] = useState<any>(null);
	const [isPolling, setIsPolling] = useState(false);

	const { data: mappings } = useQuery({
		queryKey: ['csvMappings'],
		queryFn: async () => {
			const response = await apiClient.getCSVMappings();
			return response.data;
		},
	});

	const { data: accounts } = useQuery({
		queryKey: ['accounts'],
		queryFn: async () => {
			const response = await apiClient.getAccounts();
			return response.data;
		},
	});

	const getTargetAccount = () => {
  		if (!accounts?.length) return null;
  		if (selectedAccount) return selectedAccount;
  		return accounts.find(acc => acc.is_default)?.id || accounts[0].id;
	};

	const getTargetAccountName = (): string => {
		const targetAccountId = getTargetAccount();
		if (!targetAccountId || !accounts) return 'No Account';
		
		const account = accounts.find((acc: any) => acc.id === targetAccountId);
		return account ? account.name : 'Unknown Account';
	};



	const uploadMutation = useMutation({
		mutationFn: async (file: File) => {
			const targetAccount = getTargetAccount();
			if (!targetAccount) {
				throw new Error('No account available for upload');
			}
			
			const response = await apiClient.uploadCSVWithAccount(file, targetAccount, selectedMapping);
			return response.data;
		},
		onSuccess: async (data) => {
			enqueueSnackbar('File uploaded successfully!', { variant: 'success' });
			setUploadStatus({ 
				upload_id: data.upload_id, 
				status: 'processing',
				filename: data.filename || 'Unknown'
			});
			setIsPolling(true);
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Upload failed', { variant: 'error' });
		},
	});

	// const createAccountMutation = useMutation({ // NEW
	// 	mutationFn: async () => {
	// 		// Navigate to accounts page or create a quick account
	// 		window.location.href = '/accounts';
	// 	},
	// });

	useEffect(() => {
		if (!uploadStatus?.upload_id || !isPolling) return;

		const pollStatus = async () => {
			try {
				const response = await apiClient.getUploadStatus(uploadStatus.upload_id);
				const newStatus = response.data;
				
				setUploadStatus(newStatus);

				// Stop polling if status is final
				if (newStatus.status === 'completed' || newStatus.status === 'failed') {
					setIsPolling(false);
				}
			} catch (error) {
				console.error('Polling error:', error);
				// Stop polling on error to prevent infinite failed requests
				setIsPolling(false);
				enqueueSnackbar('Failed to check upload status', { variant: 'error' });
			}
		};

		// Poll immediately, then every 2 seconds
		pollStatus();
		const interval = setInterval(pollStatus, 2000);

		// Cleanup function - this runs when component unmounts or dependencies change
		return () => {
			clearInterval(interval);
		};
	}, [uploadStatus?.upload_id, isPolling, enqueueSnackbar]);

	// NEW: Cleanup when component unmounts
	useEffect(() => {
		return () => {
			setIsPolling(false);
		};
	}, []);

	

	const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
		accept: {
			'text/csv': ['.csv'],
		},
		maxFiles: 1,
		onDrop: (files) => {
			if (files.length > 0) {
				const targetAccount = getTargetAccount();
				
				if (!targetAccount) {
					enqueueSnackbar('Please create an account before uploading transactions', { 
						variant: 'error' 
					});
					return;
				}
				
				uploadMutation.mutate(files[0]);
			}
		},
	});

	const formatFileSize = (bytes: number) => {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	};

	return (
		<Box>
			<Box display="flex" alignItems="center" gap={2} mb={3}>
				<CloudUpload color="primary" />
				<Typography variant="h4">Upload Bank Statement</Typography>
			</Box>

			{/* Info Alert */}
			<Alert severity="info" sx={{ mb: 3 }}>
				<Stack spacing={1}>
					<Typography variant="body2">
						<strong>Your files are secure:</strong> Original filenames are preserved and displayed 
						in the upload management interface so you can easily identify your imports.
					</Typography>
					<Typography variant="body2">
						Supported formats: CSV files from Swiss banks (ZKB, Cornercard) and other institutions.
					</Typography>
				</Stack>
			</Alert>

			{/* Account Management Alert */}
			{(!accounts || accounts.length === 0) && (
				<Alert severity="warning" sx={{ mb: 3 }}>
					<Typography variant="body2">
						<strong>No accounts found!</strong> You need to create at least one account before uploading transactions.
					</Typography>
					<Button 
						startIcon={<Add />} 
						onClick={() => window.location.href = '/accounts'}
						sx={{ mt: 1 }}>
						Create Your First Account
					</Button>
				</Alert>
			)}

			<Paper sx={{ p: 3, mb: 3 }}>
				<Grid container spacing={3}>
					{/* Account Selection */}
					<Grid item xs={12} md={4}>
						<FormControl fullWidth>
							<InputLabel>Target Account</InputLabel>
							<Select
								value={selectedAccount}
								onChange={(e) => setSelectedAccount(e.target.value)}
								label="Target Account"
								disabled={!accounts || accounts.length === 0}>
								
								{/* Auto-select option */}
								<MenuItem value="">
									<Box display="flex" alignItems="center" gap={1}>
										<AccountBalance fontSize="small" />
										Auto-select ({getTargetAccountName()})
									</Box>
								</MenuItem>
								
								{/* All available accounts */}
								{accounts?.map((account: any) => (
									<MenuItem key={account.id} value={account.id}>
										<Box display="flex" alignItems="center" gap={1}>
											<AccountBalance fontSize="small" />
											{account.name}
											{account.is_default && <Chip label="Default" size="small" color="primary" />}
											{account.institution && ` (${account.institution})`}
										</Box>
									</MenuItem>
								))}
							</Select>
						</FormControl>
					</Grid>

					{/* Bank Format Selection */}
					<Grid item xs={12} md={4}>
						<FormControl fullWidth>
							<InputLabel>Bank Format</InputLabel>
							<Select
								value={selectedMapping}
								onChange={(e) => setSelectedMapping(e.target.value)}
								label="Bank Format">
								<MenuItem value="">
									<Box display="flex" alignItems="center" gap={1}>
										<Visibility fontSize="small" />
										Auto-detect format
									</Box>
								</MenuItem>
								{mappings?.map((mapping: any) => (
									<MenuItem key={mapping.id} value={mapping.id}>
										<Box display="flex" alignItems="center" gap={1}>
											<InsertDriveFile fontSize="small" />
											{mapping.source_name}
										</Box>
									</MenuItem>
								))}
							</Select>
						</FormControl>
					</Grid>

					{/* Upload Summary */}
					<Grid item xs={12} md={4}>
						<Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
							<Typography variant="subtitle2" gutterBottom>
								Upload Summary
							</Typography>
							<Typography variant="body2" color="textSecondary">
								Account: <strong>{getTargetAccountName()}</strong>
							</Typography>
							<Typography variant="body2" color="textSecondary">
								Format: <strong>{selectedMapping ? mappings?.find((m: any) => m.id === selectedMapping)?.source_name : 'Auto-detect'}</strong>
							</Typography>
							{selectedAccount && (
								<Chip label="Manual Selection" size="small" color="secondary" sx={{ mt: 1 }} />
							)}
						</Paper>
					</Grid>
				</Grid>

				{/* Upload area */}
				<Box
					{...getRootProps()}
					sx={{
						border: '2px dashed',
						borderColor: isDragActive ? 'primary.main' : 'grey.300',
						borderRadius: 2,
						p: 4,
						mt: 3,
						textAlign: 'center',
						cursor: 'pointer',
						backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
						transition: 'all 0.3s ease',
						'&:hover': {
							borderColor: 'primary.main',
							backgroundColor: 'action.hover'
						}
					}}>
					<input {...getInputProps()} />
					<CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
					<Typography variant="h6" gutterBottom>
						{isDragActive ? 'Drop your CSV file here' : 'Upload your bank statement'}
					</Typography>
					<Typography variant="body2" color="textSecondary" paragraph>
						Drag & drop your CSV file here, or click to select
					</Typography>
					
					{/* Upload requirements */}
					{!getTargetAccount() ? (
						<Alert severity="error" sx={{ mt: 2, mb: 2 }}>
							Please create an account before uploading
						</Alert>
					) : (
						<Button 
							variant="contained" 
							sx={{ mt: 1 }}>
							Choose File
						</Button>
					)}
					
					<Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
						<Security fontSize="small" color="primary" />
						<Typography variant="caption" color="primary">
							Transactions will be assigned to: {getTargetAccountName()}
						</Typography>
					</Box>
				</Box>

				{acceptedFiles.length > 0 && (
					<Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
						<Typography variant="subtitle2" gutterBottom>
							Selected File:
						</Typography>
						{acceptedFiles.map((file) => (
							<Box key={file.name} display="flex" alignItems="center" gap={2}>
								<InsertDriveFile color="primary" />
								<Box flexGrow={1}>
									<Typography variant="body1" fontWeight="medium">
										{file.name}
									</Typography>
									<Typography variant="caption" color="textSecondary">
										{formatFileSize(file.size)} • {file.type || 'CSV file'} → {getTargetAccountName()}
									</Typography>
								</Box>
								<Chip 
									label={getTargetAccount() ? "Ready to upload" : "Need account"} 
									color={getTargetAccount() ? "success" : "error"} 
									size="small" 
								/>
							</Box>
						))}
					</Paper>
				)}
			</Paper>

			{/* Show upload progress and status */}
			{uploadMutation.isPending && (
				<Paper sx={{ p: 3, mb: 3 }}>
					<Typography variant="h6" gutterBottom>
						Uploading and processing your file...
					</Typography>
					<LinearProgress sx={{ mb: 2 }} />
					<Typography variant="body2" color="textSecondary">
						File: <strong>{acceptedFiles[0]?.name}</strong> → Account: <strong>{getTargetAccountName()}</strong>
					</Typography>
				</Paper>
			)}

			{isPolling && uploadStatus && (
				<Paper sx={{ p: 3, mb: 3 }}>
					<Box display="flex" alignItems="center" mb={2}>
						<CloudUpload color="primary" sx={{ mr: 1 }} />
						<Typography variant="h6">
							Processing... <Chip label="Checking status" size="small" color="primary" />
						</Typography>
					</Box>
					<LinearProgress sx={{ mb: 2 }} />
					<Typography variant="body2" color="textSecondary">
						Upload ID: {uploadStatus.upload_id}
					</Typography>
				</Paper>
			)}

			{uploadStatus && !isPolling && (
				<Paper sx={{ p: 3 }}>
					<Box display="flex" alignItems="center" mb={2}>
						{uploadStatus.status === 'completed' ? (
							<CheckCircle color="success" sx={{ mr: 1 }} />
						) : uploadStatus.status === 'failed' ? (
							<ErrorIcon color="error" sx={{ mr: 1 }} />
						) : (
							<CloudUpload color="primary" sx={{ mr: 1 }} />
						)}
						<Box flexGrow={1}>
							<Typography variant="h6">
								Processing Status: <Chip label={uploadStatus.status} size="small" />
							</Typography>
							<Typography variant="body2" color="textSecondary">
								File: {uploadStatus.filename}
								{uploadStatus.error_details?.summary?.target_account && (
									<> → Account: <strong>{uploadStatus.error_details.summary.target_account}</strong></>
								)}
							</Typography>
						</Box>
					</Box>

					{uploadStatus.status === 'completed' && (
						<Alert severity="success" sx={{ mb: 2 }}>
							<Typography variant="body2">
								<strong>Success!</strong> Processed {uploadStatus.processed_rows} of {uploadStatus.total_rows} transactions
								from <strong>{uploadStatus.filename}</strong>
								{uploadStatus.error_details?.summary?.target_account && (
									<> and assigned them to <strong>{uploadStatus.error_details.summary.target_account}</strong></>
								)}
							</Typography>
						</Alert>
					)}

					{uploadStatus.status === 'failed' && (
						<Alert severity="error" sx={{ mb: 2 }}>
							<Typography variant="body2">
								<strong>Upload failed</strong> for file <strong>{uploadStatus.filename}</strong>.
								Please check the file format and try again.
							</Typography>
						</Alert>
					)}

					{/* Rest of the existing error handling code remains the same */}
					{uploadStatus.error_details?.summary && (
						<Alert severity="info" sx={{ mt: 2 }}>
							<Typography variant="body2">
								<strong>Processing Summary for {uploadStatus.filename}:</strong><br/>
								• Total rows: {uploadStatus.error_details.summary.total_rows}<br/>
								• Successfully processed: {uploadStatus.error_details.summary.processed}<br/>
								• Skipped: {uploadStatus.error_details.summary.skipped}<br/>
								• Errors: {uploadStatus.error_details.summary.errors}
								{uploadStatus.error_details.summary.target_account && (
									<><br/>• Target account: <strong>{uploadStatus.error_details.summary.target_account}</strong></>
								)}
							</Typography>
						</Alert>
					)}

					{/* Keep existing error detail accordions */}
					{uploadStatus.error_details?.skipped && uploadStatus.error_details.skipped.length > 0 && (
						<Accordion sx={{ mt: 2 }}>
							<AccordionSummary expandIcon={<ExpandMore />}>
								<Typography variant="subtitle1">
									{uploadStatus.error_details.skipped.length} Skipped Transactions - Click to see details
								</Typography>
							</AccordionSummary>
							<AccordionDetails>
								{uploadStatus.error_details.skipped.map((skip: any, index: number) => (
									<Box key={index} sx={{ mb: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
										<Typography variant="body2">
											<strong>Row {skip.row}:</strong> {skip.reason}
										</Typography>
										{skip.data && (
											<Typography variant="caption" color="textSecondary" component="div">
												<strong>Data:</strong><br/>
												• Date: {skip.data.date || 'N/A'}<br/>
												• Description: {skip.data.description?.substring(0, 50) || 'N/A'}...<br/>
												• Debit: {skip.data.debit || 'N/A'}<br/>
												• Credit: {skip.data.credit || 'N/A'}
											</Typography>
										)}
									</Box>
								))}
							</AccordionDetails>
						</Accordion>
					)}

					{uploadStatus.status === 'completed' && (
						<>
							<Divider sx={{ my: 2 }} />
							<Box display="flex" alignItems="center" gap={1}>
								<InsertDriveFile fontSize="small" color="primary" />
								<Typography variant="body2" color="textSecondary">
									Your file <strong>{uploadStatus.filename}</strong> has been successfully processed 
									and all transactions have been assigned to the selected account.
								</Typography>
							</Box>
						</>
					)}
				</Paper>
			)}
		</Box>
	);
}