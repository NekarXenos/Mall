/**
 * MenuManager
 * A self-contained, modular menu system.
 *
 * - Creates and manages a multi-level menu from an XML data structure.
 * - Injects its own HTML and CSS link into the page.
 * - Activated by the 'Escape' key.
 * - Handles mouse interactions for navigation.
 * - Unlocks the pointer when the menu is opened.
 */
const MenuManager = {
    // --- Configuration ---
    menuDataXml: `<menu>
            <item name="The SciFi BookStore">
                <item name="The Next Sun">
                    <subtitle>Science Fiction - Pioneers reach the first planet from another solar system</subtitle>
                </item>
                <item name="CaveMan Abduction">
                    <subtitle>Sci-Fi Comedy - A Flying Saucer crashes near a group of Cave-men</subtitle>
                </item>
                <item name="The AbductoTron Chronicals">
                    <subtitle>Sci-Fi Comedy - A Grey gets bored and decides to change things up a bit</subtitle>
                </item>
                <item name="Abduction And Absurdity">
                    <subtitle>Sci-Fi Comedy - A Compilation of Sci-Fi Comedies - Just for fun AI Experiments</subtitle>
                </item>
                <item name="The Bue-Harian Chronicals">
                    <subtitle>A Science-Fiction Trilogy</subtitle>
                    <item name = "MoonRise">
                        <subtitle>Science Students trying to Simulate the Universe gone awry</subtitle>
                    </item>
                    <item name = "Bue-Har'ia">
                        <subtitle>Life in the Simulation World</subtitle>
                    </item>
                    <item name = "Z3R0">
                        <subtitle>A New Hero</subtitle>
                    </item>
                </item>
            </item>
            <item name="Art By Gerhard">
                <item name = "Acrylics on Canvas">
                    <item name ="Funk Duel">
                        <subtitle>1.2m x 0.9m</subtitle>
                    </item>
                    <item name ="Jazz Trio">
                        <subtitle>2m x 1.2m</subtitle>
                    </item>
                    <item name ="Buskers">
                        <subtitle>1.2m x 1m</subtitle>
                    </item>
                    <item name ="Bassist">
                        <subtitle>0.9m x 1.2m</subtitle>
                    </item>
                    <item name ="Saxophonist">
                        <subtitle>0.9m x 1.2m</subtitle>
                    </item>
                    <item name ="Bass Blues">
                        <subtitle>0.9m x 0.9m</subtitle>
                    </item>
                    <item name ="Sunny In The Shade">
                        <subtitle>1.2m x 0.9m</subtitle>
                    </item>
                    <item name ="Blue Morpho">
                        <subtitle>1.2m x 0.9m</subtitle>
                    </item>
                </item>
        
                <item name = "Pov-Ray 3d Renderings">
                    <item name = "Funk Duel"/>
                    <item name = "Bass Still"/>
                    <item name = "Sunny In The Shade"/>
                    <item name = "Buskers"/>
                    <item name = "Jazz Trio"/>
                    <item name = "Fusion Paint">
                        <subtitle>I developed a script in PovRay that would create an impressionistic 3d painting of a 3d Scene</subtitle>
                    </item>
                    <item name = "3d Paint Experiments">
                        <subtitle>I developed a script in PovRay that would create an impressionistic 3d painting of a 3d Scene</subtitle>
                    </item>
                </item>
            </item>
            <item name = "GO 3Design">
                <item name = "Furai-Vision Concept">
                    <subtitle>A Rotary Hyper-car Design inspired by the Mazda Furai and the Mazda RX-Vision - Designed in Rhino-3d and converted to Blender-3d</subtitle>
                </item>
                <item name = "Xaena Concept 3">
                    <subtitle>Coming Soon TM</subtitle>
                </item>
                <item name = "Quick Concept"/>
                <item name = "Concept Mockups"/>
            </item>
            <item name = "NX Dev">
                <item name = "3d Vehicle Wrap Design">
                    <subtitle>Vehicle Wrap design directly onto 3d models </subtitle>
                </item>
                <item name = "3d Paint">
                    <subtitle>Concept similar to my Pov-Ray experiments</subtitle>
                </item>
                <item name = "3d + Vector + Raster Designer">
                    <subtitle>3d + Vector + Image-Manipulation all-in-one Software. A Concept based on what I first did on the 48k ZX Spectrum</subtitle>
                </item>
            </item>
            <item name = "X-Arcade" link="Arcade/Arcade.html">
                <item name = "Pac-3d" link="Arcade/Pac3d/3dPacMan.html">
                    <subtitle>A classic maze game in 3D</subtitle>
                </item>
                <item name = "Escalated Mayhem" link="Arcade/Escalated/escalatedMayhem.html">
                    <subtitle>Action game set in a high-rise elevator</subtitle>
                </item>
                <item name = "Pac-Snake" link="Arcade/PacSnake/PacSnake.html">
                    <subtitle>A mashup of Pac-Man and Snake</subtitle>
                </item>
                <item name = "Planet Miner" link="Arcade/PlanetMiner/PlanetMiner.html">
                    <subtitle>Explore and mine voxel planets</subtitle>
                </item>
                <item name = "Flying Art" link="Arcade/PaintFlyer/PaintFlight.html">
                    <subtitle>Fly and Paint in a 3D environment</subtitle>
                </item>
                <item name = "Paint Sim" link="Arcade/Paint/Paint.html">
                    <subtitle>A Painting Simulation</subtitle>
                </item>
                <item name = "3d Road-Painter" link="Arcade/trackFlyer/FlyingTracks.html">
                    <subtitle>Get behind the wheel and fly away, leaving a road trail</subtitle>
                </item>
            </item>
            <item name = "Contact Me">
                <item name = "Email: nekarx@gmail.com"/>
                <item name = "GitHub: github.com/nekarxenos"/>
            </item>
        </menu>`,
    
    // --- State ---
    menuData: null,
    isMenuVisible: false,
    previousRenderedPath: null,
    
    // --- Core Functions ---

    /**
     * Initializes the menu system.
     * This is the entry point that should be called when the DOM is ready.
     */
    init() {
        // Prevent multiple initializations
        if (document.getElementById('modular-menu-container')) return;

        this.parseMenuXML();
        this.createMenuContainer();
        this.attachEventListeners();
    },

    /**
     * Parses the XML string into a structured JavaScript object.
     */
    parseMenuXML() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(this.menuDataXml, "application/xml");
        const menuElement = xmlDoc.querySelector('menu');

        const parseItem = (element) => {
            const item = {
                name: element.getAttribute('name'),
                link: element.getAttribute('link') || null,
                subtitle: '',
                children: []
            };
            const subtitleElement = element.querySelector(':scope > subtitle');
            if (subtitleElement) {
                item.subtitle = subtitleElement.textContent.trim();
            }
            const childItemElements = element.querySelectorAll(':scope > item');
            childItemElements.forEach(childElement => {
                item.children.push(parseItem(childElement));
            });
            return item;
        };

        const parsedMenu = { name: "Root", children: [] };
        menuElement.querySelectorAll(':scope > item').forEach(itemElement => {
            parsedMenu.children.push(parseItem(itemElement));
        });
        this.menuData = parsedMenu;
    },

    /**
     * Creates the main menu container and injects it into the DOM.
     */
    createMenuContainer() {
        const menuContainer = document.createElement('div');
        menuContainer.id = 'modular-menu-container';
        menuContainer.style.display = 'none'; // Initially hidden

        menuContainer.innerHTML = `
            <div class="menu-title">Main Menu</div>
            <div id="menu-columns-wrapper"></div>
        `;
        
        document.body.appendChild(menuContainer);
    },

    /**
     * Attaches all necessary global event listeners.
     */
    attachEventListeners() {
        // Listen for the 'Escape' key to toggle the menu
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.toggleMenu();
            }
        });

        // Add listener for clicks outside the menu to close it
        window.addEventListener('click', (event) => {
            const menuContainer = document.getElementById('modular-menu-container');
            if (this.isMenuVisible && !menuContainer.contains(event.target)) {
                this.toggleMenu();
            }
        }, true); // Use capture phase to catch clicks early
    },

    /**
     * Toggles the visibility of the menu.
     */
    toggleMenu() {
        this.isMenuVisible = !this.isMenuVisible;
        const menuContainer = document.getElementById('modular-menu-container');

        if (this.isMenuVisible) {
            // Unlock pointer if it's locked (common in 3D games)
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            menuContainer.style.display = 'flex';
            this.renderMenuColumns([]); // Render root level
            document.querySelector('#modular-menu-container .menu-title').textContent = 'Main Menu';
        } else {
            menuContainer.style.display = 'none';
            this.previousRenderedPath = null;
        }
    },

    /**
     * Renders the menu columns based on the current navigation path.
     * @param {Array<object>} currentPath - Array of menu items from the root.
     */
    renderMenuColumns(currentPath) {
        const wrapper = document.getElementById('menu-columns-wrapper');
        wrapper.innerHTML = '';
        this.previousRenderedPath = [...currentPath];

        let itemsForNextColumn = this.menuData.children;
        let currentPathSegmentForListeners = [];

        // Loop to create each column
        for (let columnIndex = 0; ; columnIndex++) {
            if (!itemsForNextColumn || itemsForNextColumn.length === 0) break;

            const columnDiv = document.createElement('div');
            columnDiv.className = 'menu-column';
            
            // Adjust margin for sub-menus to align with their parent item
            if (columnIndex > 0 && currentPath[columnIndex - 1]) {
                const prevColumn = wrapper.children[columnIndex - 1];
                if (prevColumn) {
                    const parentName = currentPath[columnIndex - 1].name;
                    const parentDiv = Array.from(prevColumn.children).find(div => div.dataset.name === parentName);
                    if (parentDiv) {
                        columnDiv.style.marginTop = parentDiv.offsetTop + 'px';
                    }
                }
            }

            // Create items within the column
            itemsForNextColumn.forEach(item => {
                const itemDiv = this.createMenuItem(item, currentPathSegmentForListeners, columnIndex);
                columnDiv.appendChild(itemDiv);
            });
            
            wrapper.appendChild(columnDiv);

            // Determine items for the *next* column
            if (currentPath[columnIndex]) {
                itemsForNextColumn = currentPath[columnIndex].children;
                currentPathSegmentForListeners.push(currentPath[columnIndex]);
            } else {
                break;
            }
        }
    },
    
    /**
     * Creates a single menu item element.
     * @param {object} item - The menu item data object.
     * @param {Array<object>} pathForListeners - The path leading up to this item's column.
     * @param {number} columnIndex - The index of the column this item belongs to.
     * @returns {HTMLElement} The created menu item div.
     */
    createMenuItem(item, pathForListeners, columnIndex) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'menu-item';
        itemDiv.dataset.name = item.name;

        // Name and Arrow
        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.name;
        if (item.children && item.children.length > 0) {
            nameSpan.innerHTML += ' <span class="arrow">&rtrif;</span>'; // Right triangle
        }
        itemDiv.appendChild(nameSpan);

        // Subtitle
        if (item.subtitle) {
            const subtitleDiv = document.createElement('div');
            subtitleDiv.className = 'subtitle';
            subtitleDiv.textContent = item.subtitle;
            itemDiv.appendChild(subtitleDiv);
        }

        // --- Event Listeners for the item ---

        // Hover to show next submenu
        itemDiv.addEventListener('mouseenter', () => {
            // Only show submenu on hover if it has children
            if (item.children && item.children.length > 0) {
                const newPath = [...pathForListeners, item];
                this.renderMenuColumns(newPath);
            } else {
                // If it has no children, hovering over it should "close" any open submenus from siblings
                const newPath = [...pathForListeners];
                this.renderMenuColumns(newPath);
            }
            // Update the main title
            const parentOfThisColumn = pathForListeners.length > 0 ? pathForListeners[pathForListeners.length - 1] : null;
            document.querySelector('#modular-menu-container .menu-title').textContent = parentOfThisColumn ? parentOfThisColumn.name : 'Main Menu';
        });
        
        // Click to navigate or show persistent submenu
        itemDiv.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent the window click listener from closing the menu
            if (item.link) {
                window.location.href = item.link;
            } else if (!item.children || item.children.length === 0) {
                // If it's an info item without a link (like contact info)
                this.showCustomAlert(`Info: ${item.name}` + (item.subtitle ? `\n${item.subtitle}` : ''));
            }
        });

        return itemDiv;
    },
    
    /**
     * Shows a custom, non-blocking alert message.
     * @param {string} message The message to display.
     */
    showCustomAlert(message) {
        // Remove existing alert box if any
        const existingAlert = document.getElementById('custom-alert-box');
        if (existingAlert) existingAlert.remove();
        
        const alertBox = document.createElement('div');
        alertBox.id = 'custom-alert-box';
        alertBox.innerHTML = `
            <p>${message.replace(/\n/g, '<br>')}</p>
            <button>OK</button>
        `;
        
        alertBox.querySelector('button').addEventListener('click', () => {
            alertBox.remove();
        });

        document.body.appendChild(alertBox);
    }
};

// --- Auto-Initialization ---
// Wait for the DOM to be fully loaded before initializing the menu.
document.addEventListener('DOMContentLoaded', () => {
    MenuManager.init();
});
