// frontend/src/pages/SavingsPockets.tsx - Main page for managing savings pockets

import React, { useState } from 'react';
import {
    Box,
    Typography,
    Button,
    Grid,
    Card,
    CardContent,
    Fab,
    Container,
    Alert,
    CircularProgress,
    Chip,
    Tooltip,
    Avatar,
    Paper,
    LinearProgress,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemAvatar,
    ListItemSecondaryAction,
    IconButton
} from '@mui/material';
import {
    Add,
    Savings,
    AccountBalance,
    TrendingUp,
    Settings,
    ExpandMore,
    Edit,
    Visibility,
    VisibilityOff,
    ShowChart,
    AttachMoney,
    Category,
    Assignment
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { SavingsPocketDialog } from '../components/SavingsPocketDialog';
import { SavingsPocketCard } from '../components/SavingsPocketCard';
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

interface UserSettings {
    show_transaction_details: boolean;
    show_reference_number: boolean;
    show_payment_method: boolean;
    show_location: boolean;
    default_currency: string;
    date_format: string;
    number_format: string;
    default_account_for_transfers?: string;
}

export const SavingsPockets: React.FC = () => {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedPocket, setSelectedPocket] = useState<SavingsPocket | undefined>();
    const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
    const [showInactive, setShowInactive] = useState(false);
    const [settingsExpanded, setSettingsExpanded] = useState(false);

    // Fetch data
    const { data: pockets, isLoading: pocketsLoading, error: pocketsError } = useQuery({
        queryKey: ['savings-pockets'],
        queryFn: () => apiClient.getSavingsPockets().then(response => response.data)
    });

    const { data: accounts, isLoading: accountsLoading } = useQuery({
        queryKey: ['accounts'],
        queryFn: () => apiClient.getAccounts().then(response => response.data)
    });

    const { data: userSettings, isLoading: settingsLoading } = useQuery({
        queryKey: ['user-settings'],
        queryFn: () => apiClient.getUserSettings().then(response => response.data),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    const { data: unallocatedTransfers } = useQuery({
        queryKey: ['unallocated-transfers'],
        queryFn: () => apiClient.getUnallocatedTransfers(5).then(response => response.data)
    });

    const updateSettingsMutation = useMutation({
        mutationFn: (data: Partial<UserSettings>) => apiClient.updateUserSettings(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-settings'] });
            enqueueSnackbar('Settings updated successfully', { variant: 'success' });
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to update settings',
                { variant: 'error' }
            );
        }
    });

    const handleCreatePocket = () => {
        setSelectedPocket(undefined);
        setDialogMode('create');
        setDialogOpen(true);
    };

    const handleEditPocket = (pocket: SavingsPocket) => {
        setSelectedPocket(pocket);
        setDialogMode('edit');
        setDialogOpen(true);
    };

    const handleDeletePocket = (pocket: SavingsPocket) => {
        if (window.confirm(`Are you sure you want to delete the savings pocket "${pocket.name}"?`)) {
            // The deletion is handled by the SavingsPocketCard component
        }
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setSelectedPocket(undefined);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF'
        }).format(amount);
    };

    const activePockets = pockets?.filter((p: SavingsPocket) => p.is_active) || [];
    const inactivePockets = pockets?.filter((p: SavingsPocket) => !p.is_active) || [];
    const displayPockets = showInactive ? pockets : activePockets;

    // Calculate summary statistics
    const totalCurrentAmount = activePockets.reduce((sum, pocket) => sum + pocket.current_amount, 0);
    const totalTargetAmount = activePockets.reduce((sum, pocket) => sum + (pocket.target_amount || 0), 0);
    const averageProgress = activePockets.length > 0
        ? activePockets.reduce((sum, pocket) => sum + pocket.progress_percentage, 0) / activePockets.length
        : 0;

    const savingsAccounts = accounts?.filter((acc: Account) =>
        acc.is_active && !acc.is_main_account
    ) || [];

    if (pocketsLoading || accountsLoading || settingsLoading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
                <CircularProgress />
            </Box>
        );
    }

    if (pocketsError) {
        return (
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <Alert severity="error">
                    Failed to load savings pockets: {pocketsError.message}
                </Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                        <Savings />
                    </Avatar>
                    <Box>
                        <Typography variant="h4" component="h1">
                            Savings Pockets
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Manage your savings goals and track progress
                        </Typography>
                    </Box>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={handleCreatePocket}
                    disabled={savingsAccounts.length === 0}
                >
                    Create Pocket
                </Button>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={3} mb={4}>
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Avatar sx={{ bgcolor: 'primary.main' }}>
                                    <AccountBalance />
                                </Avatar>
                                <Box>
                                    <Typography variant="h6">
                                        {formatCurrency(totalCurrentAmount)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Saved
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Avatar sx={{ bgcolor: 'success.main' }}>
                                    <TrendingUp />
                                </Avatar>
                                <Box>
                                    <Typography variant="h6">
                                        {formatCurrency(totalTargetAmount)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Target
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Avatar sx={{ bgcolor: 'info.main' }}>
                                    <ShowChart />
                                </Avatar>
                                <Box>
                                    <Typography variant="h6">
                                        {averageProgress.toFixed(1)}%
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Average Progress
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Avatar sx={{ bgcolor: 'warning.main' }}>
                                    <Category />
                                </Avatar>
                                <Box>
                                    <Typography variant="h6">
                                        {activePockets.length}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Active Pockets
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Unallocated Transfers */}
            {unallocatedTransfers && unallocatedTransfers.length > 0 && (
                <Accordion sx={{ mb: 4 }}>
                    <AccordionSummary expandIcon={<ExpandMore />}>
                        <Box display="flex" alignItems="center" gap={2}>
                            <Assignment />
                            <Typography variant="h6">
                                Unallocated Transfers ({unallocatedTransfers.length})
                            </Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        <List>
                            {unallocatedTransfers.map((transfer: any) => (
                                <ListItem key={transfer.id}>
                                    <ListItemText
                                        primary={`${transfer.from_account_name} → ${transfer.to_account_name}`}
                                        secondary={`${formatCurrency(transfer.amount)} • ${new Date(transfer.date).toLocaleDateString()}`}
                                    />
                                    <ListItemSecondaryAction>
                                        <Button
                                            size="small"
                                            onClick={() => {
                                                // Handle transfer assignment
                                                enqueueSnackbar('Transfer assignment not yet implemented', { variant: 'info' });
                                            }}
                                        >
                                            Assign to Pocket
                                        </Button>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                        </List>
                    </AccordionDetails>
                </Accordion>
            )}

            {/* Settings */}
            <Accordion
                expanded={settingsExpanded}
                onChange={(_, expanded) => setSettingsExpanded(expanded)}
                sx={{ mb: 4 }}
            >
                <AccordionSummary expandIcon={<ExpandMore />}>
                    <Box display="flex" alignItems="center" gap={2}>
                        <Settings />
                        <Typography variant="h6">
                            Display Settings
                        </Typography>
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="subtitle1" gutterBottom>
                                    Transaction Display
                                </Typography>
                                <Box display="flex" gap={1} flexWrap="wrap">
                                    <Chip
                                        label="Show Details"
                                        color={userSettings?.show_transaction_details ? 'primary' : 'default'}
                                        onClick={() => updateSettingsMutation.mutate({
                                            show_transaction_details: !userSettings?.show_transaction_details
                                        })}
                                    />
                                    <Chip
                                        label="Show Reference"
                                        color={userSettings?.show_reference_number ? 'primary' : 'default'}
                                        onClick={() => updateSettingsMutation.mutate({
                                            show_reference_number: !userSettings?.show_reference_number
                                        })}
                                    />
                                    <Chip
                                        label="Show Payment Method"
                                        color={userSettings?.show_payment_method ? 'primary' : 'default'}
                                        onClick={() => updateSettingsMutation.mutate({
                                            show_payment_method: !userSettings?.show_payment_method
                                        })}
                                    />
                                    <Chip
                                        label="Show Location"
                                        color={userSettings?.show_location ? 'primary' : 'default'}
                                        onClick={() => updateSettingsMutation.mutate({
                                            show_location: !userSettings?.show_location
                                        })}
                                    />
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="subtitle1" gutterBottom>
                                    Default Settings
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Currency: {userSettings?.default_currency || 'CHF'}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Date Format: {userSettings?.date_format || 'DD/MM/YYYY'}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Number Format: {userSettings?.number_format || 'Swiss'}
                                </Typography>
                            </Paper>
                        </Grid>
                    </Grid>
                </AccordionDetails>
            </Accordion>

            {/* Filters */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h6">
                    Your Savings Pockets
                </Typography>
                <Box display="flex" gap={2}>
                    <Button
                        variant={showInactive ? 'outlined' : 'contained'}
                        startIcon={showInactive ? <VisibilityOff /> : <Visibility />}
                        onClick={() => setShowInactive(!showInactive)}
                    >
                        {showInactive ? 'Hide Inactive' : 'Show All'}
                    </Button>
                </Box>
            </Box>

            {/* Savings Pockets Grid */}
            {displayPockets && displayPockets.length > 0 ? (
                <Grid container spacing={3}>
                    {displayPockets.map((pocket: SavingsPocket) => (
                        <Grid item xs={12} md={6} lg={4} key={pocket.id}>
                            <SavingsPocketCard
                                pocket={pocket}
                                onEdit={handleEditPocket}
                                onDelete={handleDeletePocket}
                            />
                        </Grid>
                    ))}
                </Grid>
            ) : (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Avatar sx={{ bgcolor: 'grey.100', mx: 'auto', mb: 2, width: 64, height: 64 }}>
                        <Savings sx={{ fontSize: 32 }} />
                    </Avatar>
                    <Typography variant="h6" gutterBottom>
                        No savings pockets yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mb={3}>
                        Create your first savings pocket to start tracking your savings goals
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={handleCreatePocket}
                        disabled={savingsAccounts.length === 0}
                    >
                        Create Your First Pocket
                    </Button>
                    {savingsAccounts.length === 0 && (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            You need to create at least one non-main account to create savings pockets.
                        </Alert>
                    )}
                </Paper>
            )}

            {/* Floating Action Button */}
            <Fab
                color="primary"
                aria-label="create pocket"
                sx={{ position: 'fixed', bottom: 16, right: 16 }}
                onClick={handleCreatePocket}
            >
                <Add />
            </Fab>

            {/* Dialog */}
            <SavingsPocketDialog
                open={dialogOpen}
                onClose={handleCloseDialog}
                pocket={selectedPocket}
                accounts={accounts || []}
                mode={dialogMode}
            />
        </Container>
    );
};
