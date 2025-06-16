// Redirect component to take users from the old transfer settings URL to the new settings page

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';

export default function TransferSettingsRedirect() {
    const navigate = useNavigate();

    useEffect(() => {
        // Redirect to the transfer settings tab in the general settings page
        const redirectTimer = setTimeout(() => {
            navigate('/settings#transfers', { replace: true });
        }, 500);

        return () => clearTimeout(redirectTimer);
    }, [navigate]);

    return (
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="50vh">
            <CircularProgress size={60} />
            <Typography variant="h6" sx={{ mt: 2 }}>
                Redirecting to Transfer Settings...
            </Typography>
        </Box>
    );
}
