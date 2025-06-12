// frontend/src/pages/Upload.tsx - Updated with account selection

import { useState } from 'react';
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
	const [selectedAccount, setSelectedAccount] = useState<string>(''); // NEW
	const [uploadStatus, setUploadStatus] = useState<any>(null);

	const { data: mappings } = useQuery({
		queryKey: ['csvMappings'],
		queryFn: async () => {
			const response = await apiClient.getCSVMappings();
			return response.data;
		},
	});

	const { data: accounts } = useQuery({ // NEW
		queryKey: ['accounts'],
		queryFn: async () => {
			const response = await apiClient.getAccounts();
			return response.data;
		},
	});

	const uploadMutation = useMutation({
		mutationFn: async (file: File) => {
			// Use updated API method with account support
			const response = await apiClient.uploadCSVWithAccount(file, selectedAccount, selectedMapping);
			return response.data;
		},
		onSuccess: async (data) => {
			enqueueSnackbar('File uploaded successfully!', { variant: 'success' });
			// Poll for status
			pollUploadStatus(data.upload_id);
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Upload failed', { variant: 'error' });
		},
	});

	const createAccountMutation = useMutation({ // NEW
		mutationFn: async () => {
			// Navigate to accounts page or create a quick account
			window.location.href = '/accounts';
		},
	});

	const pollUploadStatus = async (uploadId: string) => {
		const interval = setInterval(async () => {
			try {
				const response = await apiClient.getUploadStatus(uploadId);
				setUploadStatus(response.data);

				if (response.data.status !== 'processing') {
					clearInterval(interval);
				}
			} catch (error) {
				clearInterval(interval);
			}
		}, 2000);
	};

	const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
		accept: {
			'text/csv': ['.csv'],
		},
		maxFiles: 1,
		onDrop: (files) => {
			if (files.length > 0) {
				// Check if account is selected (if there are multiple accounts)
				if (accounts && accounts.length > 1 && !selectedAccount) {
					enqueueSnackbar('Please select an account for the transactions', { variant: 'warning' });
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

	const getSelectedAccountName = () => {
		if (!selectedAccount || !accounts) return 'Default Account';
		const account = accounts.find((acc: any) => acc.id === selectedAccount);
		return account ? account.name : 'Default Account';
	};

	const getDefaultAccount = () => {
		return accounts?.find((acc: any) => acc.is_default);
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
						onClick={() => createAccountMutation.mutate()}
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
								{accounts && accounts.length === 1 ? (
									<MenuItem value="">
										<Box display="flex" alignItems="center" gap={1}>
											<AccountBalance fontSize="small" />
											{accounts[0].name} (Default)
										</Box>
									</MenuItem>
								) : (
									<>
										<MenuItem value="">
											<Box display="flex" alignItems="center" gap={1}>
												<AccountBalance fontSize="small" />
												{getDefaultAccount() ? `${getDefaultAccount().name} (Default)` : 'Use Default Account'}
											</Box>
										</MenuItem>
										{accounts?.filter((acc: any) => !acc.is_default).map((account: any) => (
											<MenuItem key={account.id} value={account.id}>
												<Box display="flex" alignItems="center" gap={1}>
													<AccountBalance fontSize="small" />
													{account.name}
													{account.institution && ` (${account.institution})`}
												</Box>
											</MenuItem>
										))}
									</>
								)}
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
								Account: <strong>{getSelectedAccountName()}</strong>
							</Typography>
							<Typography variant="body2" color="textSecondary">
								Format: <strong>{selectedMapping ? mappings?.find((m: any) => m.id === selectedMapping)?.source_name : 'Auto-detect'}</strong>
							</Typography>
						</Paper>
					</Grid>
				</Grid>

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
					
					{/* Upload Requirements */}
					{accounts && accounts.length > 1 && !selectedAccount && (
						<Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
							Please select a target account before uploading
						</Alert>
					)}
					
					<Button 
						variant="contained" 
						sx={{ mt: 1 }}
						disabled={accounts && accounts.length > 1 && !selectedAccount}>
						Choose File
					</Button>
					
					<Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
						<Security fontSize="small" color="primary" />
						<Typography variant="caption" color="primary">
							Transactions will be assigned to: {getSelectedAccountName()}
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
										{formatFileSize(file.size)} • {file.type || 'CSV file'} → {getSelectedAccountName()}
									</Typography>
								</Box>
								<Chip label="Ready to upload" color="success" size="small" />
							</Box>
						))}
					</Paper>
				)}
			</Paper>

			{uploadMutation.isPending && (
				<Paper sx={{ p: 3, mb: 3 }}>
					<Typography variant="h6" gutterBottom>
						Uploading and processing your file...
					</Typography>
					<LinearProgress sx={{ mb: 2 }} />
					<Typography variant="body2" color="textSecondary">
						File: <strong>{acceptedFiles[0]?.name}</strong> → Account: <strong>{getSelectedAccountName()}</strong>
					</Typography>
				</Paper>
			)}

			{uploadStatus && (
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