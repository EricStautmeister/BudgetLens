// frontend/src/components/SavingsPocketDialog.tsx - Dialog for managing savings pockets

import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Grid,
    MenuItem,
    FormControl,
    InputLabel,
    OutlinedInput,
    InputAdornment,
    Box,
    Typography,
    Alert,
    Chip,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    Savings,
    Palette,
    Category,
    Close,
    Delete,
    Edit
} from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

interface SavingsPocket {
    id: string;
    name: string;
    description?: string;
    target_amount?: number;
    current_amount: number;
    color?: string;
    icon?: string;
    account_id: string;
    account_name: string;
    progress_percentage: number;
    is_active: boolean;
}

interface Account {
    id: string;
    name: string;
    account_type: string;
    is_main_account: boolean;
    account_classification: string;
    is_active: boolean;
}

interface SavingsPocketDialogProps {
    open: boolean;
    onClose: () => void;
    pocket?: SavingsPocket;
    accounts: Account[];
    mode: 'create' | 'edit';
}

const POCKET_COLORS = [
    '#4CAF50', '#2196F3', '#FF9800', '#9C27B0',
    '#F44336', '#607D8B', '#795548', '#009688'
];

const POCKET_ICONS = [
    'savings', 'home', 'flight', 'directions_car',
    'school', 'medical_services', 'shopping_cart', 'restaurant'
];

export const SavingsPocketDialog: React.FC<SavingsPocketDialogProps> = ({
    open,
    onClose,
    pocket,
    accounts,
    mode
}) => {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const [formData, setFormData] = useState({
        name: pocket?.name || '',
        description: pocket?.description || '',
        target_amount: pocket?.target_amount || '',
        account_id: pocket?.account_id || '',
        color: pocket?.color || POCKET_COLORS[0],
        icon: pocket?.icon || POCKET_ICONS[0]
    });

    const [errors, setErrors] = useState<Record<string, string>>({});

    // Filter accounts to exclude main accounts for new pockets
    const availableAccounts = accounts.filter(acc =>
        acc.is_active &&
        (mode === 'edit' || !acc.is_main_account)
    );

    const createPocketMutation = useMutation({
        mutationFn: (data: any) => apiClient.createSavingsPocket(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings-pockets'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            enqueueSnackbar('Savings pocket created successfully', { variant: 'success' });
            onClose();
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to create savings pocket',
                { variant: 'error' }
            );
        }
    });

    const updatePocketMutation = useMutation({
        mutationFn: (data: any) => apiClient.updateSavingsPocket(pocket?.id || '', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings-pockets'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            enqueueSnackbar('Savings pocket updated successfully', { variant: 'success' });
            onClose();
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to update savings pocket',
                { variant: 'error' }
            );
        }
    });

    const deletePocketMutation = useMutation({
        mutationFn: (pocketId: string) => apiClient.deleteSavingsPocket(pocketId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings-pockets'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            enqueueSnackbar('Savings pocket deleted successfully', { variant: 'success' });
            onClose();
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to delete savings pocket',
                { variant: 'error' }
            );
        }
    });

    const validateForm = () => {
        const newErrors: Record<string, string> = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Name is required';
        }

        if (!formData.account_id) {
            newErrors.account_id = 'Account is required';
        }

        if (formData.target_amount && Number(formData.target_amount) <= 0) {
            newErrors.target_amount = 'Target amount must be positive';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (!validateForm()) return;

        const submitData = {
            name: formData.name.trim(),
            description: formData.description.trim() || undefined,
            target_amount: formData.target_amount ? Number(formData.target_amount) : undefined,
            account_id: formData.account_id,
            color: formData.color,
            icon: formData.icon
        };

        if (mode === 'create') {
            createPocketMutation.mutate(submitData);
        } else {
            updatePocketMutation.mutate(submitData);
        }
    };

    const handleDelete = () => {
        if (!pocket) return;

        if (window.confirm('Are you sure you want to delete this savings pocket? This action cannot be undone.')) {
            deletePocketMutation.mutate(pocket.id);
        }
    };

    const handleClose = () => {
        setFormData({
            name: '',
            description: '',
            target_amount: '',
            account_id: '',
            color: POCKET_COLORS[0],
            icon: POCKET_ICONS[0]
        });
        setErrors({});
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box display="flex" alignItems="center" gap={1}>
                        <Savings color="primary" />
                        <Typography variant="h6">
                            {mode === 'create' ? 'Create New Savings Pocket' : 'Edit Savings Pocket'}
                        </Typography>
                    </Box>
                    <IconButton onClick={handleClose}>
                        <Close />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent>
                {availableAccounts.length === 0 && mode === 'create' && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        You need to create at least one non-main account to create savings pockets.
                    </Alert>
                )}

                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="Pocket Name"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            error={!!errors.name}
                            helperText={errors.name}
                            placeholder="Emergency Fund, Vacation, etc."
                        />
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth error={!!errors.account_id}>
                            <InputLabel>Account</InputLabel>
                            <OutlinedInput
                                value={formData.account_id}
                                onChange={(e) => setFormData(prev => ({ ...prev, account_id: e.target.value }))}
                                label="Account"
                                readOnly={mode === 'edit'}
                                endAdornment={
                                    mode === 'edit' && (
                                        <InputAdornment position="end">
                                            <Chip label="Cannot change" size="small" />
                                        </InputAdornment>
                                    )
                                }
                            />
                            {mode === 'create' && (
                                <TextField
                                    select
                                    fullWidth
                                    value={formData.account_id}
                                    onChange={(e) => setFormData(prev => ({ ...prev, account_id: e.target.value }))}
                                    error={!!errors.account_id}
                                    helperText={errors.account_id}
                                    sx={{ mt: 1 }}
                                >
                                    {availableAccounts.map(account => (
                                        <MenuItem key={account.id} value={account.id}>
                                            {account.name} ({account.account_type})
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}
                        </FormControl>
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Description"
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Optional description of this savings goal"
                            multiline
                            rows={2}
                        />
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="Target Amount"
                            type="number"
                            value={formData.target_amount}
                            onChange={(e) => setFormData(prev => ({ ...prev, target_amount: e.target.value }))}
                            error={!!errors.target_amount}
                            helperText={errors.target_amount || 'Optional savings goal amount'}
                            InputProps={{
                                startAdornment: <InputAdornment position="start">CHF</InputAdornment>,
                            }}
                        />
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                            <InputLabel>Color</InputLabel>
                            <OutlinedInput
                                value={formData.color}
                                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                                label="Color"
                                startAdornment={
                                    <InputAdornment position="start">
                                        <Box
                                            sx={{
                                                width: 20,
                                                height: 20,
                                                bgcolor: formData.color,
                                                borderRadius: '50%',
                                                border: '1px solid #ccc'
                                            }}
                                        />
                                    </InputAdornment>
                                }
                            />
                        </FormControl>
                        <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {POCKET_COLORS.map(color => (
                                <Tooltip key={color} title={`Use ${color}`}>
                                    <Box
                                        sx={{
                                            width: 24,
                                            height: 24,
                                            bgcolor: color,
                                            borderRadius: '50%',
                                            border: formData.color === color ? '2px solid #000' : '1px solid #ccc',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => setFormData(prev => ({ ...prev, color }))}
                                    />
                                </Tooltip>
                            ))}
                        </Box>
                    </Grid>

                    <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom>
                            Icon
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {POCKET_ICONS.map(icon => (
                                <Tooltip key={icon} title={`Use ${icon} icon`}>
                                    <IconButton
                                        onClick={() => setFormData(prev => ({ ...prev, icon }))}
                                        sx={{
                                            border: formData.icon === icon ? '2px solid primary.main' : '1px solid #ccc',
                                            borderRadius: 1
                                        }}
                                    >
                                        <Category />
                                    </IconButton>
                                </Tooltip>
                            ))}
                        </Box>
                    </Grid>

                    {mode === 'edit' && pocket && (
                        <Grid item xs={12}>
                            <Alert severity="info">
                                <Typography variant="body2">
                                    Current Balance: CHF {pocket.current_amount.toFixed(2)}
                                    {pocket.target_amount && (
                                        <> | Progress: {pocket.progress_percentage.toFixed(1)}%</>
                                    )}
                                </Typography>
                            </Alert>
                        </Grid>
                    )}
                </Grid>
            </DialogContent>

            <DialogActions>
                <Box display="flex" justifyContent="space-between" width="100%">
                    <Box>
                        {mode === 'edit' && (
                            <Button
                                onClick={handleDelete}
                                color="error"
                                startIcon={<Delete />}
                                disabled={deletePocketMutation.isPending}
                            >
                                Delete Pocket
                            </Button>
                        )}
                    </Box>
                    <Box display="flex" gap={1}>
                        <Button onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            variant="contained"
                            disabled={
                                createPocketMutation.isPending ||
                                updatePocketMutation.isPending ||
                                availableAccounts.length === 0
                            }
                        >
                            {mode === 'create' ? 'Create Pocket' : 'Update Pocket'}
                        </Button>
                    </Box>
                </Box>
            </DialogActions>
        </Dialog>
    );
};
