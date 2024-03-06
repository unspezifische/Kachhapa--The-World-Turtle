import React, { useEffect, useState } from 'react';
import { Paper, Grid, IconButton } from '@mui/material';
import { WidthProvider, Responsive } from 'react-grid-layout';
import { Resizable } from 'react-resizable';
import EditIcon from '@mui/icons-material/Edit';

const ResponsiveGridLayout = WidthProvider(Responsive);

console.log('ResponsiveGridLayout component is being rendered');

const ResizablePaper = (props) => {
    console.log('ResizablePaper component is being rendered');
    const [hover, setHover] = useState(false);

    return (
        <Resizable
            onResizeStart={props.onResizeStart}
            onResize={props.onResize}
            onResizeStop={props.onResizeStop}
        >
            <Paper 
                style={{ position: 'relative', overflow: 'hidden' }}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
            >
                {props.children}
                {hover && <IconButton style={{ position: 'absolute', top: 0, right: 0 }}><props.editIcon /></IconButton>}
                <span style={{ position: 'absolute', bottom: 0, right: 0 }}>::</span>
            </Paper>
        </Resizable>
    );
};

const Tile = ({ data = [], editIcon = EditIcon }) => {
    console.log('Tile component is being rendered');
    const [layout, setLayout] = useState(data);

    useEffect(() => {
        console.log('Tile component is being mounted');

        return () => {
            console.log('Tile component is being unmounted');
        };
    }, []);

    console.log('layout:', layout);

    const onResizeStart = (layout, oldItem) => {
        // You can do something when the resize starts, for example, log it
        console.log(`Started resizing item with id: ${oldItem.i}`);
    };

    const onResize = (layout, oldItem, newItem, placeholder, e, element) => {
        // Update the layout state with the new layout
        const newLayout = layout.map(item => {
            if (item.i === oldItem.i) {
                return { ...item, ...newItem };
            }
            return item;
        });

        console.log('New layout:', newLayout); // Add this line

        setLayout(newLayout);
    };

    const onResizeStop = (layout, oldItem, newItem) => {
        // You can do something when the resize stops, for example, log it
        console.log(`Stopped resizing item with id: ${newItem.i}`);
    };

    return (
        <ResponsiveGridLayout className="layout" cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }} onResize={onResize}>
            {layout.map((item, index) => (
                <div key={item.i} data-grid={{ x: item.x, y: item.y, w: item.w, h: item.h }}>
                    <ResizablePaper onResizeStart={onResizeStart} onResize={onResize} onResizeStop={onResizeStop} editIcon={editIcon}>
                        <span className="text">{item.content}</span>
                    </ResizablePaper>
                </div>
            ))}
        </ResponsiveGridLayout>
    );
};

export default Tile;