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
	List,
	ListItem,
	ListItemIcon,
	ListItemText,
	Chip,
} from '@mui/material';
import { CloudUpload, CheckCircle, Error as ErrorIcon, Description } from '@mui/icons-material';
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

	return (
		<Box>
			<Typography variant="h4" gutterBottom>
				Upload Bank Statement
			</Typography>

			<Paper sx={{ p: 3, mb: 3 }}>
				<FormControl fullWidth sx={{ mb: 3 }}>
					<InputLabel>Bank Format</InputLabel>
					<Select
						value={selectedMapping}
						onChange={(e) => setSelectedMapping(e.target.value)}
						label="Bank Format">
						<MenuItem value="">Auto-detect</MenuItem>
						{mappings?.map((mapping: any) => (
							<MenuItem key={mapping.id} value={mapping.id}>
								{mapping.source_name}
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
					}}>
					<input {...getInputProps()} />
					<CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
					<Typography variant="h6" gutterBottom>
						{isDragActive ? 'Drop the file here' : 'Drag & drop your CSV file here'}
					</Typography>
					<Typography variant="body2" color="textSecondary">
						or click to select a file
					</Typography>
					<Button variant="contained" sx={{ mt: 2 }}>
						Choose File
					</Button>
				</Box>

				{acceptedFiles.length > 0 && (
					<List sx={{ mt: 2 }}>
						{acceptedFiles.map((file) => (
							<ListItem key={file.name}>
								<ListItemIcon>
									<Description />
								</ListItemIcon>
								<ListItemText primary={file.name} secondary={`${(file.size / 1024).toFixed(2)} KB`} />
							</ListItem>
						))}
					</List>
				)}
			</Paper>

			{uploadMutation.isPending && (
				<Paper sx={{ p: 3 }}>
					<Typography variant="h6" gutterBottom>
						Uploading...
					</Typography>
					<LinearProgress />
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
							<LinearProgress sx={{ mr: 1, flexGrow: 1 }} />
						)}
						<Typography variant="h6">
							Processing Status: <Chip label={uploadStatus.status} size="small" />
						</Typography>
					</Box>

					{uploadStatus.status === 'completed' && (
						<Alert severity="success">
							Successfully processed {uploadStatus.processed_rows} of {uploadStatus.total_rows}{' '}
							transactions
						</Alert>
					)}

					{uploadStatus.error_count > 0 && (
						<Alert severity="warning" sx={{ mt: 2 }}>
							{uploadStatus.error_count} errors occurred during processing
							{uploadStatus.error_details && (
								<Box sx={{ mt: 1 }}>
									{uploadStatus.error_details.slice(0, 5).map((error: any, index: number) => (
										<Typography key={index} variant="caption" display="block">
											Row {error.row}: {error.error}
										</Typography>
									))}
								</Box>
							)}
						</Alert>
					)}
				</Paper>
			)}
		</Box>
	);
}
