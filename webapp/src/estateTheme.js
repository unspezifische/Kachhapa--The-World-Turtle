import { createTheme } from '@mui/material/styles';

export const estateDialogTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#ffe08a' },
    text: { primary: '#ffe08a', secondary: '#e7c86e', disabled: '#a49360' },
    background: { paper: '#14201c', default: '#14201c' },
  },
});
