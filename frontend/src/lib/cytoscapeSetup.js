// Register Cytoscape.js extensions once at app boot.
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import coseBilkent from "cytoscape-cose-bilkent";
import dagre from "cytoscape-dagre";
import svg from "cytoscape-svg";

let registered = false;
export function registerCytoscapeExtensions() {
  if (registered) return;
  try { cytoscape.use(fcose); } catch (e) {}
  try { cytoscape.use(coseBilkent); } catch (e) {}
  try { cytoscape.use(dagre); } catch (e) {}
  try { cytoscape.use(svg); } catch (e) {}
  registered = true;
}
registerCytoscapeExtensions();
export default cytoscape;
