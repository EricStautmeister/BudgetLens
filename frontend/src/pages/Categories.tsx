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
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	TextField,
	Checkbox,
	FormControlLabel,
	Chip,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

export default function Categories() {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [open, setOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState<any>(null);
	const [formData, setFormData] = useState({
		name: '',
		is_automatic_deduction: false,
		is_savings: false,
	});

	const { data: categories } = useQuery({
		queryKey: ['categories'],
		queryFn: async () => {
			const response = await apiClient.getCategories();
			return response.data;
		},
	});

	const createMutation = useMutation({
		mutationFn: async (data: any) => {
			return apiClient.createCategory(data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['categories'] });
			enqueueSnackbar('Category created successfully', { variant: 'success' });
			handleClose();
		},
	});

	const updateMutation = useMutation({
		mutationFn: async ({ id, data }: any) => {
			return apiClient.updateCategory(id, data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['categories'] });
			enqueueSnackbar('Category updated successfully', { variant: 'success' });
			handleClose();
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			return apiClient.deleteCategory(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['categories'] });
			enqueueSnackbar('Category deleted successfully', { variant: 'success' });
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Delete failed', { variant: 'error' });
		},
	});

	const handleOpen = (category?: any) => {
		if (category) {
			setEditingCategory(category);
			setFormData({
				name: category.name,
				is_automatic_deduction: category.is_automatic_deduction,
				is_savings: category.is_savings,
			});
		} else {
			setEditingCategory(null);
			setFormData({
				name: '',
				is_automatic_deduction: false,
				is_savings: false,
			});
		}
		setOpen(true);
	};

	const handleClose = () => {
		setOpen(false);
		setEditingCategory(null);
	};

	const handleSubmit = () => {
		if (editingCategory) {
			updateMutation.mutate({ id: editingCategory.id, data: formData });
		} else {
			createMutation.mutate(formData);
		}
	};

	return (
		<Box>
			<Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
				<Typography variant="h4">Categories</Typography>
				<Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>
					Add Category
				</Button>
			</Box>

			<TableContainer component={Paper}>
				<Table>
					<TableHead>
						<TableRow>
							<TableCell>Name</TableCell>
							<TableCell>Type</TableCell>
							<TableCell align="center">Actions</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{categories?.map((category: any) => (
							<TableRow key={category.id}>
								<TableCell>{category.name}</TableCell>
								<TableCell>
									{category.is_savings && (
										<Chip label="Savings" color="primary" size="small" sx={{ mr: 1 }} />
									)}
									{category.is_automatic_deduction && (
										<Chip label="Automatic" color="secondary" size="small" />
									)}
									{!category.is_savings && !category.is_automatic_deduction && (
										<Chip label="Regular" size="small" />
									)}
								</TableCell>
								<TableCell align="center">
									<IconButton onClick={() => handleOpen(category)}>
										<Edit />
									</IconButton>
									<IconButton
										onClick={() => {
											if (confirm('Delete this category?')) {
												deleteMutation.mutate(category.id);
											}
										}}>
										<Delete />
									</IconButton>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</TableContainer>

			<Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
				<DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
				<DialogContent>
					<TextField
						fullWidth
						label="Category Name"
						value={formData.name}
						onChange={(e) => setFormData({ ...formData, name: e.target.value })}
						sx={{ mt: 2, mb: 2 }}
					/>
					<FormControlLabel
						control={
							<Checkbox
								checked={formData.is_automatic_deduction}
								onChange={(e) => setFormData({ ...formData, is_automatic_deduction: e.target.checked })}
							/>
						}
						label="Automatic Deduction"
					/>
					<FormControlLabel
						control={
							<Checkbox
								checked={formData.is_savings}
								onChange={(e) => setFormData({ ...formData, is_savings: e.target.checked })}
							/>
						}
						label="Savings Category"
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleClose}>Cancel</Button>
					<Button onClick={handleSubmit} variant="contained">
						{editingCategory ? 'Update' : 'Create'}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
