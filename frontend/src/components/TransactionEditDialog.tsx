// frontend/src/components/TransactionEditDialog.tsx - Dialog for editing transaction details

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Grid,
    Typography,
    Box,
    Chip,
    FormControlLabel,
    Switch,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { apiClient } from '../services/api';

interface TransactionEditDialogProps {
    open: boolean;
    onClose: () => void;
    transaction: any;
}

const ensureArray = (data: any): any[] => {
    if (Array.isArray(data)) return data;
    if (data === null || data === undefined) return [];
    if (typeof data === 'object') {
        if (Array.isArray(data.items)) return data.items;
        if (Array.isArray(data.results)) return data.results;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.transactions)) return data.transactions;
        if (Array.isArray(data.categories)) return data.categories;
        if (Array.isArray(data.accounts)) return data.accounts;
        if (Array.isArray(data.vendors)) return data.vendors;
    }
    return [];
};

export default function TransactionEditDialog({ open, onClose, transaction }: TransactionEditDialogProps) {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const [formData, setFormData] = useState({
        vendor_id: '',
        category_id: '',
        is_transfer: false,
        details: '',
        reference_number: '',
        payment_method: '',
        merchant_category: '',
        location: '',
        savings_pocket_id: '',
    });

    // Load data when transaction changes
    useEffect(() => {
        if (transaction) {
            setFormData({
                vendor_id: transaction.vendor_id || '',
                category_id: transaction.category_id || '',
                is_transfer: transaction.is_transfer || false,
                details: transaction.details || '',
                reference_number: transaction.reference_number || '',
                payment_method: transaction.payment_method || '',
                merchant_category: transaction.merchant_category || '',
                location: transaction.location || '',
                savings_pocket_id: transaction.savings_pocket_id || '',
            });
        }
    }, [transaction]);

    const { data: categories } = useQuery({
        queryKey: ['categories'],
        queryFn: async () => {
            try {
                const response = await apiClient.getCategories();
                return ensureArray(response.data);
            } catch (error) {
                console.error('Error fetching categories:', error);
                return [];
            }
        },
        enabled: open,
    });

    const { data: vendors } = useQuery({
        queryKey: ['vendors'],
        queryFn: async () => {
            try {
                const response = await apiClient.getVendors();
                return ensureArray(response.data);
            } catch (error) {
                console.error('Error fetching vendors:', error);
                return [];
            }
        },
        enabled: open,
    });

    const { data: savingsPockets } = useQuery({
        queryKey: ['savingsPockets'],
        queryFn: async () => {
            try {
                const response = await apiClient.getSavingsPockets();
                return ensureArray(response.data);
            } catch (error) {
                console.error('Error fetching savings pockets:', error);
                return [];
            }
        },
        enabled: open,
    });

    const updateMutation = useMutation({
        mutationFn: async (data: any) => {
            return apiClient.updateTransaction(transaction.id, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            enqueueSnackbar('Transaction updated successfully', { variant: 'success' });
            onClose();
        },
        onError: (error: any) => {
            enqueueSnackbar(error.response?.data?.detail || 'Failed to update transaction', { variant: 'error' });
        },
    });

    const handleSubmit = () => {
        // Only include non-empty values
        const updateData: any = {};

        if (formData.vendor_id) updateData.vendor_id = formData.vendor_id;
        if (formData.category_id) updateData.category_id = formData.category_id;
        updateData.is_transfer = formData.is_transfer;
        if (formData.details) updateData.details = formData.details;
        if (formData.reference_number) updateData.reference_number = formData.reference_number;
        if (formData.payment_method) updateData.payment_method = formData.payment_method;
        if (formData.merchant_category) updateData.merchant_category = formData.merchant_category;
        if (formData.location) updateData.location = formData.location;
        if (formData.savings_pocket_id) updateData.savings_pocket_id = formData.savings_pocket_id;

        updateMutation.mutate(updateData);
    };

    const handleInputChange = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    if (!transaction) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Typography variant="h6">Edit Transaction</Typography>
                <Box mt={1}>
                    <Typography variant="body2" color="textSecondary">
                        {format(new Date(transaction.date), 'MMM dd, yyyy')} • {transaction.description}
                    </Typography>
                    <Chip
                        label={`${transaction.amount >= 0 ? '+' : ''}$${Math.abs(transaction.amount).toFixed(2)}`}
                        color={transaction.amount >= 0 ? 'success' : 'default'}
                        size="small"
                        sx={{ mt: 0.5 }}
                    />
                </Box>
            </DialogTitle>

            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                            <InputLabel>Category</InputLabel>
                            <Select
                                value={formData.category_id}
                                onChange={(e) => handleInputChange('category_id', e.target.value)}
                                label="Category"
                            >
                                <MenuItem value="">None</MenuItem>
                                {ensureArray(categories).map((category: any) => (
                                    <MenuItem key={category.id} value={category.id}>
                                        {category.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                            <InputLabel>Vendor</InputLabel>
                            <Select
                                value={formData.vendor_id}
                                onChange={(e) => handleInputChange('vendor_id', e.target.value)}
                                label="Vendor"
                            >
                                <MenuItem value="">None</MenuItem>
                                {ensureArray(vendors).map((vendor: any) => (
                                    <MenuItem key={vendor.id} value={vendor.id}>
                                        {vendor.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                            <InputLabel>Savings Pocket</InputLabel>
                            <Select
                                value={formData.savings_pocket_id}
                                onChange={(e) => handleInputChange('savings_pocket_id', e.target.value)}
                                label="Savings Pocket"
                            >
                                <MenuItem value="">None</MenuItem>
                                {ensureArray(savingsPockets).map((pocket: any) => (
                                    <MenuItem key={pocket.id} value={pocket.id}>
                                        {pocket.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="Payment Method"
                            value={formData.payment_method}
                            onChange={(e) => handleInputChange('payment_method', e.target.value)}
                            placeholder="e.g., Card, Transfer, Cash"
                        />
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="Reference Number"
                            value={formData.reference_number}
                            onChange={(e) => handleInputChange('reference_number', e.target.value)}
                            placeholder="Transaction reference"
                        />
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="Merchant Category"
                            value={formData.merchant_category}
                            onChange={(e) => handleInputChange('merchant_category', e.target.value)}
                            placeholder="e.g., Restaurant, Gas Station"
                        />
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="Location"
                            value={formData.location}
                            onChange={(e) => handleInputChange('location', e.target.value)}
                            placeholder="Transaction location"
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Details"
                            value={formData.details}
                            onChange={(e) => handleInputChange('details', e.target.value)}
                            placeholder="Additional details or notes"
                            multiline
                            rows={3}
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={formData.is_transfer}
                                    onChange={(e) => handleInputChange('is_transfer', e.target.checked)}
                                />
                            }
                            label="Mark as Transfer"
                        />
                    </Grid>
                </Grid>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={updateMutation.isPending}
                >
                    {updateMutation.isPending ? 'Updating...' : 'Update Transaction'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
