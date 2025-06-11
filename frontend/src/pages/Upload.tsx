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
	Divider
} from '@mui/material';
import { 
	CloudUpload, 
	CheckCircle, 
	Error as ErrorIcon,  
	ExpandMore,
	InsertDriveFile,
	Security,
	Visibility
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

export default function Upload() {
	const { enqueueSnackbar } = useSnackbar();
	const [selectedMapping, setSelectedMapping] = useState<string>('');
	const [uploadStatus, setUploadStatus] = useState<any>(null);

	const { data: mappings } = useQuery({
		queryKey: ['csvMappings'],
		queryFn: async () => {
			const response = await apiClient.getCSVMappings();
			return response.data;
		},
	});

	const uploadMutation = useMutation({
		mutationFn: async (file: File) => {
			const response = await apiClient.uploadCSV(file, selectedMapping);
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

			<Paper sx={{ p: 3, mb: 3 }}>
				<FormControl fullWidth sx={{ mb: 3 }}>
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

				<Box
					{...getRootProps()}
					sx={{
						border: '2px dashed',
						borderColor: isDragActive ? 'primary.main' : 'grey.300',
						borderRadius: 2,
						p: 4,
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
					<Button variant="contained" sx={{ mt: 1 }}>
						Choose File
					</Button>
					
					<Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
						<Security fontSize="small" color="primary" />
						<Typography variant="caption" color="primary">
							Original filename preserved for easy identification
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
										{formatFileSize(file.size)} • {file.type || 'CSV file'}
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
						Your original filename is being preserved: {acceptedFiles[0]?.name}
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
							</Typography>
						</Box>
					</Box>

					{uploadStatus.status === 'completed' && (
						<Alert severity="success" sx={{ mb: 2 }}>
							<Typography variant="body2">
								<strong>Success!</strong> Processed {uploadStatus.processed_rows} of {uploadStatus.total_rows} transactions
								from your file <strong>{uploadStatus.filename}</strong>
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

					{/* Enhanced Error Display */}
					{uploadStatus.error_details?.summary && (
						<Alert severity="info" sx={{ mt: 2 }}>
							<Typography variant="body2">
								<strong>Processing Summary for {uploadStatus.filename}:</strong><br/>
								• Total rows: {uploadStatus.error_details.summary.total_rows}<br/>
								• Successfully processed: {uploadStatus.error_details.summary.processed}<br/>
								• Skipped: {uploadStatus.error_details.summary.skipped}<br/>
								• Errors: {uploadStatus.error_details.summary.errors}
							</Typography>
						</Alert>
					)}

					{/* Skipped Transactions */}
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

					{/* Error Details */}
					{uploadStatus.error_details?.errors && uploadStatus.error_details.errors.length > 0 && (
						<Accordion sx={{ mt: 2 }}>
							<AccordionSummary expandIcon={<ExpandMore />}>
								<Typography variant="subtitle1" color="error">
									{uploadStatus.error_details.errors.length} Processing Errors - Click to see details
								</Typography>
							</AccordionSummary>
							<AccordionDetails>
								{uploadStatus.error_details.errors.map((error: any, index: number) => (
									<Box key={index} sx={{ mb: 1, p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
										<Typography variant="body2" color="error">
											<strong>Row {error.row}:</strong> {error.error}
										</Typography>
										{error.data && (
											<Typography variant="caption" color="textSecondary" component="div" sx={{ mt: 1 }}>
												<strong>Raw Data:</strong><br/>
												<pre style={{ fontSize: '11px', margin: 0 }}>
													{JSON.stringify(error.data, null, 2)}
												</pre>
											</Typography>
										)}
									</Box>
								))}
							</AccordionDetails>
						</Accordion>
					)}

					{/* Legacy error handling for backward compatibility */}
					{uploadStatus.error_count > 0 && !uploadStatus.error_details && (
						<Alert severity="warning" sx={{ mt: 2 }}>
							{uploadStatus.error_count} errors occurred during processing of {uploadStatus.filename}
						</Alert>
					)}

					{uploadStatus.status === 'completed' && (
						<>
							<Divider sx={{ my: 2 }} />
							<Box display="flex" alignItems="center" gap={1}>
								<InsertDriveFile fontSize="small" color="primary" />
								<Typography variant="body2" color="textSecondary">
									Your file <strong>{uploadStatus.filename}</strong> has been successfully processed 
									and is now available in the Upload Management section.
								</Typography>
							</Box>
						</>
					)}
				</Paper>
			)}
		</Box>
	);
}