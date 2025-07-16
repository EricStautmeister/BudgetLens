// frontend/src/components/SavingsAccountMappingDialog.tsx - Component for managing savings account mappings

import { useState, useEffect } from 'react';
import {
    Box,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Typography,
    Alert,
    Grid,
    Chip,
    IconButton,
    Paper,
} from '@mui/material';
import { Delete, AccountBalance } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

interface Account {
    id: string;
    name: string;
    account_type: string;
    institution?: string;
    is_active: boolean;
    is_main_account: boolean;
    account_classification: string;
}

interface SavingsMapping {
    id: string;
    savings_category_id: string;
    account_id: string;
    target_amount?: number;
    current_amount: number;
    savings_category_name?: string;
    account_name?: string;
    is_active: boolean;
}

interface Category {
    id: string;
    name: string;
    category_type: string;
}

interface SavingsAccountMappingDialogProps {
    open: boolean;
    onClose: () => void;
    categoryId?: string;
    categoryName?: string;
}

export const SavingsAccountMappingDialog: React.FC<SavingsAccountMappingDialogProps> = ({
    open,
    onClose,
    categoryId,
    categoryName
}) => {
    const { enqueueSnackbar } = useSnackbar();
    const queryClient = useQueryClient();

    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [targetAmount, setTargetAmount] = useState<number | ''>('');
    const [currentAmount, setCurrentAmount] = useState<number | ''>('');

    // Get all accounts
    const { data: accountsResponse } = useQuery({
        queryKey: ['accounts'],
        queryFn: () => apiClient.getAccounts(),
    });
    const accounts = accountsResponse?.data || [];

    // Get existing savings mappings
    const { data: mappingsResponse, refetch: refetchMappings } = useQuery({
        queryKey: ['savings-mappings'],
        queryFn: () => apiClient.getSavingsMappings(),
        enabled: open,
    });
    const allMappings = mappingsResponse?.data || [];

    // Filter mappings for current category
    const categoryMappings = categoryId
        ? allMappings.filter((m: SavingsMapping) => m.savings_category_id === categoryId)
        : [];

    // Get savings categories
    const { data: categoriesResponse } = useQuery({
        queryKey: ['categories'],
        queryFn: () => apiClient.getCategories(),
    });
    const savingsCategories = (categoriesResponse?.data || []).filter(
        (cat: Category) => cat.category_type === 'SAVING'
    );

    // Create mapping mutation
    const createMappingMutation = useMutation({
        mutationFn: (data: {
            savings_category_id: string;
            account_id: string;
            target_amount?: number;
            current_amount?: number;
        }) => apiClient.createSavingsMapping(data),
        onSuccess: () => {
            enqueueSnackbar('Savings mapping created successfully', { variant: 'success' });
            refetchMappings();
            resetForm();
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to create savings mapping',
                { variant: 'error' }
            );
        },
    });

    // Delete mapping mutation
    const deleteMappingMutation = useMutation({
        mutationFn: (mappingId: string) => apiClient.deleteSavingsMapping(mappingId),
        onSuccess: () => {
            enqueueSnackbar('Savings mapping deleted successfully', { variant: 'success' });
            refetchMappings();
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to delete savings mapping',
                { variant: 'error' }
            );
        },
    });

    const resetForm = () => {
        setSelectedAccountId('');
        setTargetAmount('');
        setCurrentAmount('');
    };

    const handleSubmit = () => {
        if (!categoryId || !selectedAccountId) {
            enqueueSnackbar('Please select an account', { variant: 'warning' });
            return;
        }

        createMappingMutation.mutate({
            savings_category_id: categoryId,
            account_id: selectedAccountId,
            target_amount: targetAmount === '' ? undefined : Number(targetAmount),
            current_amount: currentAmount === '' ? 0 : Number(currentAmount),
        });
    };

    const handleDeleteMapping = (mappingId: string) => {
        deleteMappingMutation.mutate(mappingId);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    // Get available accounts (not already mapped to this category)
    const availableAccounts = accounts.filter((account: Account) =>
        !categoryMappings.some((mapping: SavingsMapping) => mapping.account_id === account.id)
    );

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" gap={1}>
                    <AccountBalance />
                    <Typography variant="h6">
                        Savings Account Mapping
                        {categoryName && ` - ${categoryName}`}
                    </Typography>
                </Box>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mt: 2 }}>
                    {!categoryId && (
                        <Alert severity="info" sx={{ mb: 3 }}>
                            Select a savings category to manage its account mappings.
                        </Alert>
                    )}

                    {categoryId && (
                        <>
                            <Typography variant="h6" gutterBottom>
                                Current Mappings
                            </Typography>

                            {categoryMappings.length === 0 ? (
                                <Alert severity="info" sx={{ mb: 3 }}>
                                    No account mappings for this savings category yet.
                                </Alert>
                            ) : (
                                <Box sx={{ mb: 3 }}>
                                    {categoryMappings.map((mapping: SavingsMapping) => (
                                        <Paper key={mapping.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
                                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                                <Box>
                                                    <Typography variant="subtitle1">
                                                        {mapping.account_name}
                                                    </Typography>
                                                    <Box display="flex" gap={1} mt={1}>
                                                        {mapping.target_amount && (
                                                            <Chip
                                                                label={`Target: CHF ${mapping.target_amount.toLocaleString()}`}
                                                                size="small"
                                                                color="primary"
                                                            />
                                                        )}
                                                        <Chip
                                                            label={`Current: CHF ${mapping.current_amount.toLocaleString()}`}
                                                            size="small"
                                                            variant="outlined"
                                                        />
                                                    </Box>
                                                </Box>
                                                <IconButton
                                                    onClick={() => handleDeleteMapping(mapping.id)}
                                                    color="error"
                                                    size="small"
                                                >
                                                    <Delete />
                                                </IconButton>
                                            </Box>
                                        </Paper>
                                    ))}
                                </Box>
                            )}

                            <Typography variant="h6" gutterBottom>
                                Add New Mapping
                            </Typography>

                            {availableAccounts.length === 0 ? (
                                <Alert severity="warning">
                                    All available accounts are already mapped to this savings category.
                                </Alert>
                            ) : (
                                <Grid container spacing={2}>
                                    <Grid item xs={12}>
                                        <FormControl fullWidth>
                                            <InputLabel>Account</InputLabel>
                                            <Select
                                                value={selectedAccountId}
                                                onChange={(e) => setSelectedAccountId(e.target.value)}
                                                label="Account"
                                            >
                                                {availableAccounts.map((account: Account) => (
                                                    <MenuItem key={account.id} value={account.id}>
                                                        {account.name} ({account.account_type})
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField
                                            fullWidth
                                            label="Target Amount (CHF)"
                                            type="number"
                                            value={targetAmount}
                                            onChange={(e) => setTargetAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                            helperText="Optional savings goal"
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField
                                            fullWidth
                                            label="Current Amount (CHF)"
                                            type="number"
                                            value={currentAmount}
                                            onChange={(e) => setCurrentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                            helperText="Current balance in this account for this savings goal"
                                        />
                                    </Grid>
                                </Grid>
                            )}
                        </>
                    )}

                    {!categoryId && savingsCategories.length > 0 && (
                        <>
                            <Typography variant="h6" gutterBottom>
                                All Savings Categories
                            </Typography>
                            <Box>
                                {savingsCategories.map((category: Category) => {
                                    const categoryMappingsCount = allMappings.filter(
                                        (m: SavingsMapping) => m.savings_category_id === category.id
                                    ).length;

                                    return (
                                        <Paper key={category.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
                                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                                <Typography variant="subtitle1">
                                                    {category.name}
                                                </Typography>
                                                <Chip
                                                    label={`${categoryMappingsCount} mappings`}
                                                    size="small"
                                                    color={categoryMappingsCount > 0 ? 'primary' : 'default'}
                                                />
                                            </Box>
                                        </Paper>
                                    );
                                })}
                            </Box>
                        </>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>
                    Close
                </Button>
                {categoryId && availableAccounts.length > 0 && (
                    <Button
                        onClick={handleSubmit}
                        variant="contained"
                        disabled={!selectedAccountId || createMappingMutation.isPending}
                    >
                        {createMappingMutation.isPending ? 'Adding...' : 'Add Mapping'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};
