const fs = require('fs');
const xml2js = require('xml2js');

const xmlPath = './assets/xml/HabboAvatarActions.xml';
const jsonPath = './assets/xml/HabboAvatarActions-converted.json';

// Read XML file
const xmlData = fs.readFileSync(xmlPath, 'utf-8');

// Parse XML
const parser = new xml2js.Parser({ 
    explicitArray: false,
    mergeAttrs: true
});

parser.parseString(xmlData, (err, result) => {
    if (err) {
        console.error('Error parsing XML:', err);
        return;
    }

    const actions = [];
    const xmlActions = Array.isArray(result.actions.action) ? result.actions.action : [result.actions.action];

    xmlActions.forEach(action => {
        const jsonAction = {
            id: action.id,
            state: action.state,
            precedence: parseInt(action.precedence)
        };

        // Handle optional attributes
        if (action.main === '1') jsonAction.main = true;
        if (action.animation === '1') jsonAction.animation = true;
        if (action.isdefault === '1') jsonAction.isDefault = true;
        if (action.geometrytype) jsonAction.geometryType = action.geometrytype;
        if (action.activepartset) jsonAction.activePartSet = action.activepartset;
        if (action.assetpartdefinition) jsonAction.assetPartDefinition = action.assetpartdefinition;
        if (action.startfromframezero === 'true') jsonAction.startFromFrameZero = true;
        if (action.preventheadturn === 'true') jsonAction.preventHeadTurn = true;
        if (action.lay) jsonAction.lay = action.lay;

        // Handle prevents
        if (action.prevents) {
            jsonAction.prevents = action.prevents.split(',');
        }

        // Handle types (for AvatarEffect)
        if (action.type) {
            const types = Array.isArray(action.type) ? action.type : [action.type];
            jsonAction.types = types.map(type => {
                const jsonType = {
                    id: type.id
                };
                
                if (type.animated !== undefined) {
                    jsonType.animated = type.animated === 'true';
                }
                if (type.preventheadturn === 'true') {
                    jsonType.preventHeadTurn = true;
                }
                if (type.prevents) {
                    jsonType.prevents = type.prevents.split(',');
                }
                
                return jsonType;
            });
        }

        // Handle params (for UseItem and CarryItem)
        if (action.param) {
            const params = Array.isArray(action.param) ? action.param : [action.param];
            jsonAction.params = params.map(param => ({
                id: param.id,
                value: param.value
            }));
        }

        actions.push(jsonAction);
    });

    // Create final JSON structure
    const output = {
        actions: actions
    };

    // Write to file
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 4), 'utf-8');
    console.log(`Converted XML to JSON successfully!`);
    console.log(`Output file: ${jsonPath}`);
});
