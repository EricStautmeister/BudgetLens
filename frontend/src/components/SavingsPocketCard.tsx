// frontend/src/components/SavingsPocketCard.tsx - Card component for displaying savings pockets

import React from 'react';
import {
    Card,
    CardContent,
    CardActions,
    Typography,
    LinearProgress,
    Box,
    Chip,
    IconButton,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Tooltip,
    Avatar
} from '@mui/material';
import {
    MoreVert,
    Edit,
    Delete,
    AccountBalance,
    TrendingUp,
    AttachMoney,
    Category
} from '@mui/icons-material';
import { useState } from 'react';
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

interface SavingsPocketCardProps {
    pocket: SavingsPocket;
    onEdit: (pocket: SavingsPocket) => void;
    onDelete: (pocket: SavingsPocket) => void;
}

export const SavingsPocketCard: React.FC<SavingsPocketCardProps> = ({
    pocket,
    onEdit,
    onDelete
}) => {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);

    const toggleActiveMutation = useMutation({
        mutationFn: (pocketId: string) => apiClient.toggleSavingsPocketActive(pocketId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings-pockets'] });
            enqueueSnackbar(
                `Savings pocket ${pocket.is_active ? 'deactivated' : 'activated'}`,
                { variant: 'success' }
            );
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to update pocket status',
                { variant: 'error' }
            );
        }
    });

    const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const handleToggleActive = () => {
        toggleActiveMutation.mutate(pocket.id);
        handleMenuClose();
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF'
        }).format(amount);
    };

    const getProgressColor = (percentage: number) => {
        if (percentage >= 100) return 'success';
        if (percentage >= 75) return 'info';
        if (percentage >= 50) return 'warning';
        return 'error';
    };

    const getStatusChip = () => {
        if (!pocket.is_active) {
            return <Chip label="Inactive" size="small" color="default" />;
        }
        if (pocket.target_amount && pocket.current_amount >= pocket.target_amount) {
            return <Chip label="Goal Reached" size="small" color="success" />;
        }
        return <Chip label="Active" size="small" color="primary" />;
    };

    return (
        <Card
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                opacity: pocket.is_active ? 1 : 0.7,
                border: pocket.is_active ? `2px solid ${pocket.color || '#4CAF50'}` : '1px solid #e0e0e0'
            }}
        >
            <CardContent sx={{ flexGrow: 1 }}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Avatar
                            sx={{
                                bgcolor: pocket.color || '#4CAF50',
                                width: 40,
                                height: 40
                            }}
                        >
                            <Category />
                        </Avatar>
                        <Box>
                            <Typography variant="h6" component="h3" gutterBottom>
                                {pocket.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {pocket.account_name}
                            </Typography>
                        </Box>
                    </Box>
                    <Box display="flex" alignItems="center" gap={1}>
                        {getStatusChip()}
                        <IconButton
                            size="small"
                            onClick={handleMenuClick}
                            aria-label="more options"
                        >
                            <MoreVert />
                        </IconButton>
                    </Box>
                </Box>

                {pocket.description && (
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        {pocket.description}
                    </Typography>
                )}

                <Box mb={2}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                        <Typography variant="body2" color="text.secondary">
                            Current Balance
                        </Typography>
                        <Typography variant="h6" color="primary">
                            {formatCurrency(pocket.current_amount)}
                        </Typography>
                    </Box>

                    {pocket.target_amount && (
                        <>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="body2" color="text.secondary">
                                    Target Amount
                                </Typography>
                                <Typography variant="body2">
                                    {formatCurrency(pocket.target_amount)}
                                </Typography>
                            </Box>

                            <Box mb={1}>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                                    <Typography variant="body2" color="text.secondary">
                                        Progress
                                    </Typography>
                                    <Typography variant="body2" color={getProgressColor(pocket.progress_percentage)}>
                                        {pocket.progress_percentage.toFixed(1)}%
                                    </Typography>
                                </Box>
                                <LinearProgress
                                    variant="determinate"
                                    value={Math.min(pocket.progress_percentage, 100)}
                                    color={getProgressColor(pocket.progress_percentage)}
                                    sx={{ height: 8, borderRadius: 4 }}
                                />
                            </Box>

                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary">
                                    Remaining
                                </Typography>
                                <Typography variant="body2">
                                    {formatCurrency(Math.max(0, pocket.target_amount - pocket.current_amount))}
                                </Typography>
                            </Box>
                        </>
                    )}
                </Box>

                <Box display="flex" gap={1} flexWrap="wrap">
                    <Tooltip title="Account Balance">
                        <Chip
                            icon={<AccountBalance />}
                            label={formatCurrency(pocket.current_amount)}
                            size="small"
                            variant="outlined"
                        />
                    </Tooltip>
                    {pocket.target_amount && (
                        <Tooltip title="Progress">
                            <Chip
                                icon={<TrendingUp />}
                                label={`${pocket.progress_percentage.toFixed(0)}%`}
                                size="small"
                                variant="outlined"
                                color={getProgressColor(pocket.progress_percentage)}
                            />
                        </Tooltip>
                    )}
                </Box>
            </CardContent>

            <CardActions>
                <Box display="flex" justifyContent="space-between" width="100%">
                    <Typography variant="caption" color="text.secondary">
                        Last updated: {new Date().toLocaleDateString()}
                    </Typography>
                </Box>
            </CardActions>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <MenuItem onClick={() => { onEdit(pocket); handleMenuClose(); }}>
                    <ListItemIcon>
                        <Edit fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Edit Pocket</ListItemText>
                </MenuItem>

                <MenuItem onClick={handleToggleActive}>
                    <ListItemIcon>
                        <AccountBalance fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>
                        {pocket.is_active ? 'Deactivate' : 'Activate'} Pocket
                    </ListItemText>
                </MenuItem>

                <MenuItem
                    onClick={() => { onDelete(pocket); handleMenuClose(); }}
                    sx={{ color: 'error.main' }}
                >
                    <ListItemIcon>
                        <Delete fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText>Delete Pocket</ListItemText>
                </MenuItem>
            </Menu>
        </Card>
    );
};
