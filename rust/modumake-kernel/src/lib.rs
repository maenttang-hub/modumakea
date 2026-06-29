use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KernelNetSpec {
    id: String,
    known_voltage: Option<f64>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KernelResistorSpec {
    net_a: String,
    net_b: String,
    resistance_ohms: f64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KernelDiodeSpec {
    net_a: String,
    net_k: String,
    forward_voltage_drop: Option<f64>,
    saturation_current: Option<f64>,
    emission_coefficient: Option<f64>,
    thermal_voltage: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SolveRequest {
    nets: Vec<KernelNetSpec>,
    resistors: Vec<KernelResistorSpec>,
    #[serde(default)]
    diodes: Vec<KernelDiodeSpec>,
    max_iterations: Option<usize>,
    tolerance: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SolveResponse {
    voltages: Vec<(String, f64)>,
    converged: bool,
    iterations: usize,
    mode: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CppCallArgument {
    raw: String,
    kind: String,
    value: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CppCallCapture {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    subject: Option<String>,
    arguments: Vec<CppCallArgument>,
    line: usize,
    raw: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CppParseTree {
    backend: String,
    source: String,
    preprocessed_source: String,
    sanitized_source: String,
    has_errors: bool,
    calls: Vec<CppCallCapture>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ParsedCppOperation {
    #[serde(rename = "type")]
    op_type: String,
    board_pin: String,
    mode: Option<String>,
    value: Option<String>,
    line: usize,
    scope: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ParsedCppI2cAddressUse {
    address: String,
    line: usize,
    source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    template_hint: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ParsedCppInterruptUse {
    board_pin: String,
    line: usize,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CppReviewArtifactsResponse {
    language: String,
    operations: Vec<ParsedCppOperation>,
    i2c_address_uses: Vec<ParsedCppI2cAddressUse>,
    interrupt_uses: Vec<ParsedCppInterruptUse>,
    included_headers: Vec<String>,
    parse_tree: Option<CppParseTree>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CollectOperationsRequest {
    code: String,
    board_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParsePythonRequest {
    source: String,
    board_id: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PythonAlias {
    name: String,
    board_pin: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PythonParseTree {
    backend: String,
    source: String,
    sanitized_source: String,
    has_errors: bool,
    calls: Vec<CppCallCapture>,
    operations: Vec<ParsedCppOperation>,
    aliases: Vec<PythonAlias>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PythonReviewArtifactsResponse {
    language: String,
    operations: Vec<ParsedCppOperation>,
    parse_tree: PythonParseTree,
}

const DEFAULT_DIODE_FORWARD_GUESS: f64 = 0.68;
const DEFAULT_DIODE_ON_CONDUCTANCE: f64 = 1000.0;
const DEFAULT_DIODE_OFF_CONDUCTANCE: f64 = 1e-9;

#[wasm_bindgen]
pub fn solve_dc_network_json(input_json: &str) -> String {
    let request = match serde_json::from_str::<SolveRequest>(input_json) {
        Ok(value) => value,
        Err(_) => return "null".to_string(),
    };

    match solve_dc_network(request) {
        Some(result) => serde_json::to_string(&result).unwrap_or_else(|_| "null".to_string()),
        None => "null".to_string(),
    }
}

#[wasm_bindgen]
pub fn parse_cpp_json(source: &str) -> String {
    let tree = parse_cpp(source);
    serde_json::to_string(&tree).unwrap_or_else(|_| "null".to_string())
}

#[wasm_bindgen]
pub fn collect_cpp_operations_json(input_json: &str) -> String {
    let request = match serde_json::from_str::<CollectOperationsRequest>(input_json) {
        Ok(value) => value,
        Err(_) => return "[]".to_string(),
    };

    let operations = collect_cpp_operations(&request.code, &request.board_id);
    serde_json::to_string(&operations).unwrap_or_else(|_| "[]".to_string())
}

#[wasm_bindgen]
pub fn collect_cpp_review_artifacts_json(input_json: &str) -> String {
    let request = match serde_json::from_str::<CollectOperationsRequest>(input_json) {
        Ok(value) => value,
        Err(_) => return "null".to_string(),
    };

    let parse_tree = parse_cpp(&request.code);
    let preprocessed = parse_tree
        .as_ref()
        .map(|tree| tree.preprocessed_source.clone())
        .unwrap_or_else(|| preprocess_cpp_source(&strip_cpp_comments(&request.code)));
    let sanitized_source = parse_tree
        .as_ref()
        .map(|tree| tree.sanitized_source.clone())
        .unwrap_or_else(|| strip_cpp_comments(&request.code));

    let response = CppReviewArtifactsResponse {
        language: "cpp".to_string(),
        operations: collect_cpp_operations(&request.code, &request.board_id),
        i2c_address_uses: collect_i2c_address_uses(&preprocessed),
        interrupt_uses: collect_interrupt_uses(&preprocessed, &request.board_id),
        included_headers: collect_included_headers(&sanitized_source),
        parse_tree,
    };

    serde_json::to_string(&response).unwrap_or_else(|_| "null".to_string())
}

#[wasm_bindgen]
pub fn parse_python_json(input_json: &str) -> String {
    let request = match serde_json::from_str::<ParsePythonRequest>(input_json) {
        Ok(value) => value,
        Err(_) => return "null".to_string(),
    };

    let tree = parse_python(&request.source, &request.board_id);
    serde_json::to_string(&tree).unwrap_or_else(|_| "null".to_string())
}

#[wasm_bindgen]
pub fn collect_python_operations_json(input_json: &str) -> String {
    let request = match serde_json::from_str::<CollectOperationsRequest>(input_json) {
        Ok(value) => value,
        Err(_) => return "[]".to_string(),
    };

    let operations = collect_python_operations(&request.code, &request.board_id);
    serde_json::to_string(&operations).unwrap_or_else(|_| "[]".to_string())
}

#[wasm_bindgen]
pub fn collect_python_review_artifacts_json(input_json: &str) -> String {
    let request = match serde_json::from_str::<CollectOperationsRequest>(input_json) {
        Ok(value) => value,
        Err(_) => return "null".to_string(),
    };

    let parse_tree = parse_python(&request.code, &request.board_id);
    let response = PythonReviewArtifactsResponse {
        language: "python".to_string(),
        operations: parse_tree.operations.clone(),
        parse_tree,
    };

    serde_json::to_string(&response).unwrap_or_else(|_| "null".to_string())
}

fn solve_dc_network(request: SolveRequest) -> Option<SolveResponse> {
    let unknown_net_ids = request
        .nets
        .iter()
        .filter(|net| net.known_voltage.is_none())
        .map(|net| net.id.clone())
        .collect::<Vec<_>>();

    if unknown_net_ids.is_empty() {
        return Some(SolveResponse {
            voltages: vec![],
            converged: true,
            iterations: 0,
            mode: if request.diodes.is_empty() {
                "linear".to_string()
            } else {
                "nonlinear".to_string()
            },
        });
    }

    if request.diodes.is_empty() {
        let solution = solve_resistive_guess(&request.nets, &request.resistors)?;
        return Some(SolveResponse {
            voltages: solution.into_iter().collect(),
            converged: true,
            iterations: 1,
            mode: "linear".to_string(),
        });
    }

    let known_voltages = request
        .nets
        .iter()
        .filter_map(|net| net.known_voltage.map(|value| (net.id.clone(), value)))
        .collect::<HashMap<_, _>>();
    let base_guess = solve_resistive_guess(&request.nets, &request.resistors);
    let average_known_voltage = if known_voltages.is_empty() {
        0.0
    } else {
        known_voltages.values().sum::<f64>() / known_voltages.len() as f64
    };

    let mut diode_guess_by_net: HashMap<String, Vec<f64>> = HashMap::new();
    for diode in &request.diodes {
        let forward_guess = diode.forward_voltage_drop.unwrap_or(DEFAULT_DIODE_FORWARD_GUESS);

        if let Some(cathode_known) = known_voltages.get(&diode.net_k) {
            if !known_voltages.contains_key(&diode.net_a) {
                diode_guess_by_net
                    .entry(diode.net_a.clone())
                    .or_default()
                    .push(cathode_known + forward_guess);
            }
        }

        if let Some(anode_known) = known_voltages.get(&diode.net_a) {
            if !known_voltages.contains_key(&diode.net_k) {
                diode_guess_by_net
                    .entry(diode.net_k.clone())
                    .or_default()
                    .push(anode_known - forward_guess);
            }
        }
    }

    let index_by_net_id = unknown_net_ids
        .iter()
        .enumerate()
        .map(|(index, net_id)| (net_id.clone(), index))
        .collect::<HashMap<_, _>>();

    let mut current = unknown_net_ids
        .iter()
        .map(|net_id| {
            diode_guess_by_net
                .get(net_id)
                .map(|items| items.iter().sum::<f64>() / items.len() as f64)
                .or_else(|| base_guess.as_ref().and_then(|guess| guess.get(net_id).copied()))
                .unwrap_or(average_known_voltage)
        })
        .collect::<Vec<_>>();

    let max_iterations = request.max_iterations.unwrap_or(40);
    let tolerance = request.tolerance.unwrap_or(1e-7);

    for iteration in 0..max_iterations {
        let mut jacobian = vec![vec![0.0; unknown_net_ids.len()]; unknown_net_ids.len()];
        let mut residual = vec![0.0; unknown_net_ids.len()];

        for resistor in &request.resistors {
            if resistor.net_a == resistor.net_b || resistor.resistance_ohms <= 0.0 {
                continue;
            }

            let conductance = 1.0 / resistor.resistance_ohms;
            let voltage_a = read_voltage(&resistor.net_a, &current, &index_by_net_id, &known_voltages);
            let voltage_b = read_voltage(&resistor.net_b, &current, &index_by_net_id, &known_voltages);
            let branch_current = conductance * (voltage_a - voltage_b);
            stamp_branch(
                &mut residual,
                &mut jacobian,
                &index_by_net_id,
                &resistor.net_a,
                &resistor.net_b,
                branch_current,
                conductance,
            );
        }

        for diode in &request.diodes {
            if diode.net_a == diode.net_k {
                continue;
            }

            let voltage_a = read_voltage(&diode.net_a, &current, &index_by_net_id, &known_voltages);
            let voltage_k = read_voltage(&diode.net_k, &current, &index_by_net_id, &known_voltages);
            let voltage_delta = voltage_a - voltage_k;

            if let Some(forward_drop) = diode.forward_voltage_drop {
                let conductance = if voltage_delta >= forward_drop {
                    DEFAULT_DIODE_ON_CONDUCTANCE
                } else {
                    DEFAULT_DIODE_OFF_CONDUCTANCE
                };
                let branch_current = if voltage_delta >= forward_drop {
                    conductance * (voltage_delta - forward_drop)
                } else {
                    conductance * voltage_delta
                };

                stamp_branch(
                    &mut residual,
                    &mut jacobian,
                    &index_by_net_id,
                    &diode.net_a,
                    &diode.net_k,
                    branch_current,
                    conductance,
                );
                continue;
            }

            let emission = diode.emission_coefficient.unwrap_or(1.9);
            let thermal_voltage = diode.thermal_voltage.unwrap_or(0.02585);
            let thermal_base = emission * thermal_voltage;
            let saturation_current = diode.saturation_current.unwrap_or(2e-9);
            let exponent = ((voltage_delta / thermal_base).clamp(-40.0, 40.0)).exp();
            let branch_current = saturation_current * (exponent - 1.0);
            let conductance = (saturation_current / thermal_base) * exponent;

            stamp_branch(
                &mut residual,
                &mut jacobian,
                &index_by_net_id,
                &diode.net_a,
                &diode.net_k,
                branch_current,
                conductance,
            );
        }

        let delta = solve_linear_system(jacobian, residual.iter().map(|value| -value).collect())?;
        let mut largest_step = 0.0;

        for (index, step) in delta.iter().enumerate() {
            current[index] += step;
            largest_step = largest_step.max(step.abs());
        }

        if largest_step < tolerance {
            return Some(SolveResponse {
                voltages: unknown_net_ids
                    .iter()
                    .enumerate()
                    .map(|(index, net_id)| (net_id.clone(), current[index]))
                    .collect(),
                converged: true,
                iterations: iteration + 1,
                mode: "nonlinear".to_string(),
            });
        }
    }

    Some(SolveResponse {
        voltages: unknown_net_ids
            .iter()
            .enumerate()
            .map(|(index, net_id)| (net_id.clone(), current[index]))
            .collect(),
        converged: false,
        iterations: max_iterations,
        mode: "nonlinear".to_string(),
    })
}

fn solve_resistive_guess(
    nets: &[KernelNetSpec],
    resistors: &[KernelResistorSpec],
) -> Option<HashMap<String, f64>> {
    let mut connected_net_ids = HashSet::new();
    for resistor in resistors {
        connected_net_ids.insert(resistor.net_a.clone());
        connected_net_ids.insert(resistor.net_b.clone());
    }

    let unknown_net_ids = nets
        .iter()
        .filter(|net| connected_net_ids.contains(&net.id) && net.known_voltage.is_none())
        .map(|net| net.id.clone())
        .collect::<Vec<_>>();

    if unknown_net_ids.is_empty() {
        return Some(HashMap::new());
    }

    let net_map = nets
        .iter()
        .map(|net| (net.id.clone(), net.clone()))
        .collect::<HashMap<_, _>>();
    let index_by_net_id = unknown_net_ids
        .iter()
        .enumerate()
        .map(|(index, net_id)| (net_id.clone(), index))
        .collect::<HashMap<_, _>>();
    let mut matrix = vec![vec![0.0; unknown_net_ids.len()]; unknown_net_ids.len()];
    let mut rhs = vec![0.0; unknown_net_ids.len()];

    for resistor in resistors {
        if resistor.net_a == resistor.net_b || resistor.resistance_ohms <= 0.0 {
            continue;
        }

        let conductance = 1.0 / resistor.resistance_ohms;
        let a_index = index_by_net_id.get(&resistor.net_a).copied();
        let b_index = index_by_net_id.get(&resistor.net_b).copied();
        let net_a = net_map.get(&resistor.net_a);
        let net_b = net_map.get(&resistor.net_b);

        if let Some(index) = a_index {
            matrix[index][index] += conductance;
            if let Some(other_index) = b_index {
                matrix[index][other_index] -= conductance;
            } else if let Some(known) = net_b.and_then(|net| net.known_voltage) {
                rhs[index] += conductance * known;
            }
        }

        if let Some(index) = b_index {
            matrix[index][index] += conductance;
            if let Some(other_index) = a_index {
                matrix[index][other_index] -= conductance;
            } else if let Some(known) = net_a.and_then(|net| net.known_voltage) {
                rhs[index] += conductance * known;
            }
        }
    }

    let solution = solve_linear_system(matrix, rhs)?;
    Some(
        unknown_net_ids
            .iter()
            .enumerate()
            .map(|(index, net_id)| (net_id.clone(), solution[index]))
            .collect(),
    )
}

fn solve_linear_system(mut matrix: Vec<Vec<f64>>, mut rhs: Vec<f64>) -> Option<Vec<f64>> {
    let size = rhs.len();
    if size == 0 {
        return Some(vec![]);
    }

    for pivot in 0..size {
        let mut max_row = pivot;
        for row in (pivot + 1)..size {
            if matrix[row][pivot].abs() > matrix[max_row][pivot].abs() {
                max_row = row;
            }
        }

        if matrix[max_row][pivot].abs() < 1e-12 {
            return None;
        }

        if max_row != pivot {
            matrix.swap(pivot, max_row);
            rhs.swap(pivot, max_row);
        }

        for row in (pivot + 1)..size {
            let factor = matrix[row][pivot] / matrix[pivot][pivot];
            if !factor.is_finite() {
                return None;
            }

            for col in pivot..size {
                matrix[row][col] -= factor * matrix[pivot][col];
            }
            rhs[row] -= factor * rhs[pivot];
        }
    }

    let mut solution = vec![0.0; size];
    for row in (0..size).rev() {
        let mut sum = 0.0;
        for col in (row + 1)..size {
            sum += matrix[row][col] * solution[col];
        }

        if matrix[row][row].abs() < 1e-12 {
            return None;
        }
        solution[row] = (rhs[row] - sum) / matrix[row][row];
    }

    Some(solution)
}

fn read_voltage(
    net_id: &str,
    current: &[f64],
    index_by_net_id: &HashMap<String, usize>,
    known_voltages: &HashMap<String, f64>,
) -> f64 {
    if let Some(index) = index_by_net_id.get(net_id) {
        return current[*index];
    }

    known_voltages.get(net_id).copied().unwrap_or(0.0)
}

fn stamp_branch(
    residual: &mut [f64],
    jacobian: &mut [Vec<f64>],
    index_by_net_id: &HashMap<String, usize>,
    net_a: &str,
    net_b: &str,
    current_ab: f64,
    conductance: f64,
) {
    let a_index = index_by_net_id.get(net_a).copied();
    let b_index = index_by_net_id.get(net_b).copied();

    if let Some(index) = a_index {
        residual[index] += current_ab;
        jacobian[index][index] += conductance;
        if let Some(other_index) = b_index {
            jacobian[index][other_index] -= conductance;
        }
    }

    if let Some(index) = b_index {
        residual[index] -= current_ab;
        jacobian[index][index] += conductance;
        if let Some(other_index) = a_index {
            jacobian[index][other_index] -= conductance;
        }
    }
}

fn parse_cpp(source: &str) -> Option<CppParseTree> {
    let sanitized_source = strip_cpp_comments(source);
    let preprocessed_source = preprocess_cpp_source(&sanitized_source);

    if has_obvious_syntax_error(&preprocessed_source) {
        return None;
    }

    Some(CppParseTree {
        backend: "rust-wasm".to_string(),
        source: source.to_string(),
        preprocessed_source: preprocessed_source.clone(),
        sanitized_source,
        has_errors: false,
        calls: collect_call_captures(&preprocessed_source),
    })
}

fn collect_cpp_operations(code: &str, board_id: &str) -> Vec<ParsedCppOperation> {
    let preprocessed = preprocess_cpp_source(&strip_cpp_comments(code));
    let aliases = build_cpp_alias_map(&preprocessed, board_id);
    let scopes = collect_function_scopes(&preprocessed);
    let calls = collect_call_captures(&preprocessed);
    let mut operations = Vec::new();

    for call in calls {
        let op_type = match call.name.as_str() {
            "pinMode" => "pinMode",
            "digitalWrite" => "digitalWrite",
            "analogWrite" => "analogWrite",
            "digitalRead" => "digitalRead",
            "analogRead" => "analogRead",
            _ => continue,
        };

        let raw_pin = call.arguments.get(0).map(|argument| argument.value.as_str()).unwrap_or("");
        let Some(board_pin) = resolve_pin_reference(raw_pin, board_id, &aliases) else {
            continue;
        };

        operations.push(ParsedCppOperation {
            op_type: op_type.to_string(),
            board_pin,
            mode: if op_type == "pinMode" {
                call.arguments.get(1).map(|argument| argument.value.clone())
            } else {
                None
            },
            value: if op_type == "pinMode" {
                None
            } else {
                call.arguments.get(1).map(|argument| argument.value.clone())
            },
            line: call.line,
            scope: scope_for_line(call.line, &scopes),
        });
    }

    operations
}

fn strip_cpp_comments(code: &str) -> String {
    let chars = code.chars().collect::<Vec<_>>();
    let mut index = 0usize;
    let mut output = String::with_capacity(code.len());

    while index < chars.len() {
        let current = chars[index];
        let next = chars.get(index + 1).copied();

        if current == '/' && next == Some('/') {
            output.push(' ');
            output.push(' ');
            index += 2;
            while index < chars.len() && chars[index] != '\n' && chars[index] != '\r' {
                output.push(' ');
                index += 1;
            }
            continue;
        }

        if current == '/' && next == Some('*') {
            output.push(' ');
            output.push(' ');
            index += 2;
            while index < chars.len() {
                let ch = chars[index];
                let lookahead = chars.get(index + 1).copied();
                if ch == '*' && lookahead == Some('/') {
                    output.push(' ');
                    output.push(' ');
                    index += 2;
                    break;
                }

                if ch == '\n' || ch == '\r' {
                    output.push(ch);
                } else {
                    output.push(' ');
                }
                index += 1;
            }
            continue;
        }

        output.push(current);
        index += 1;
    }

    output
}

fn preprocess_cpp_source(source: &str) -> String {
    let mut macros = HashMap::new();

    for line in source.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("#define ") {
            continue;
        }

        let parts = trimmed.split_whitespace().collect::<Vec<_>>();
        if parts.len() >= 3 && !parts[1].contains('(') {
            macros.insert(parts[1].to_string(), parts[2..].join(" "));
        }
    }

    let mut output_lines = Vec::new();
    for line in source.lines() {
        if line.trim_start().starts_with('#') {
            output_lines.push(line.to_string());
            continue;
        }

        let mut rewritten = line.to_string();
        for (name, value) in &macros {
            rewritten = rewritten.replace(name, value);
        }
        output_lines.push(rewritten);
    }

    output_lines.join("\n")
}

fn has_obvious_syntax_error(source: &str) -> bool {
    let mut stack = Vec::new();
    let mut in_single = false;
    let mut in_double = false;
    let chars = source.chars().collect::<Vec<_>>();

    for index in 0..chars.len() {
        let current = chars[index];
        let previous = if index > 0 { Some(chars[index - 1]) } else { None };

        if current == '\'' && previous != Some('\\') && !in_double {
            in_single = !in_single;
            continue;
        }

        if current == '"' && previous != Some('\\') && !in_single {
            in_double = !in_double;
            continue;
        }

        if in_single || in_double {
            continue;
        }

        match current {
            '(' | '{' | '[' => stack.push(current),
            ')' => {
                if stack.pop() != Some('(') {
                    return true;
                }
            }
            '}' => {
                if stack.pop() != Some('{') {
                    return true;
                }
            }
            ']' => {
                if stack.pop() != Some('[') {
                    return true;
                }
            }
            _ => {}
        }
    }

    in_single || in_double || !stack.is_empty()
}

fn collect_call_captures(code: &str) -> Vec<CppCallCapture> {
    let chars = code.chars().collect::<Vec<_>>();
    let mut captures = Vec::new();
    let mut index = 0usize;

    while index < chars.len() {
        if !(chars[index].is_ascii_alphabetic() || chars[index] == '_') {
            index += 1;
            continue;
        }

        let start = index;
        index += 1;
        while index < chars.len() && (chars[index].is_ascii_alphanumeric() || chars[index] == '_') {
            index += 1;
        }
        let name = chars[start..index].iter().collect::<String>();

        while index < chars.len() && chars[index].is_whitespace() {
            index += 1;
        }

        if chars.get(index) != Some(&'(') {
            continue;
        }

        let open_index = index;
        index += 1;
        let mut depth = 1i32;
        while index < chars.len() && depth > 0 {
            match chars[index] {
                '(' => depth += 1,
                ')' => depth -= 1,
                _ => {}
            }
            index += 1;
        }

        if depth != 0 {
            break;
        }

        let raw = chars[start..index].iter().collect::<String>();
        let args_raw = chars[(open_index + 1)..(index - 1)].iter().collect::<String>();
        let line = code[..start].chars().filter(|ch| *ch == '\n').count() + 1;
        let subject = read_call_subject(&chars, start);

        captures.push(CppCallCapture {
            name,
            subject,
            arguments: split_arguments(&args_raw)
                .into_iter()
                .map(|argument| {
                    let trimmed = argument.trim().to_string();
                    let kind = if trimmed.starts_with('"') || trimmed.starts_with('\'') {
                        "string"
                    } else if trimmed.parse::<f64>().is_ok() {
                        "number"
                    } else if trimmed
                        .chars()
                        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '.')
                    {
                        "identifier"
                    } else {
                        "expression"
                    };

                    CppCallArgument {
                        raw: argument,
                        kind: kind.to_string(),
                        value: trimmed,
                    }
                })
                .collect(),
            line,
            raw,
        });
    }

    captures
}

fn read_call_subject(chars: &[char], call_name_start: usize) -> Option<String> {
    if call_name_start == 0 {
        return None;
    }

    let mut cursor = call_name_start.saturating_sub(1);
    while cursor > 0 && chars[cursor].is_whitespace() {
        cursor = cursor.saturating_sub(1);
    }

    if chars.get(cursor).copied() != Some('.') {
        return None;
    }

    if cursor == 0 {
        return None;
    }

    let subject_end = cursor;
    cursor = cursor.saturating_sub(1);

    while chars
        .get(cursor)
        .copied()
        .map(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '.')
        .unwrap_or(false)
    {
        if cursor == 0 {
            break;
        }
        cursor -= 1;
    }

    let subject_start = if chars
        .get(cursor)
        .copied()
        .map(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '.')
        .unwrap_or(false)
    {
        cursor
    } else {
        cursor + 1
    };

    let subject = chars[subject_start..subject_end].iter().collect::<String>();
    let trimmed = subject.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn split_arguments(raw: &str) -> Vec<String> {
    if raw.trim().is_empty() {
        return vec![];
    }

    let mut args = Vec::new();
    let mut current = String::new();
    let mut depth = 0i32;

    for ch in raw.chars() {
        match ch {
            '(' => {
                depth += 1;
                current.push(ch);
            }
            ')' => {
                depth -= 1;
                current.push(ch);
            }
            ',' if depth == 0 => {
                args.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    if !current.trim().is_empty() {
        args.push(current.trim().to_string());
    }

    args
}

fn normalize_i2c_address_token(raw: &str) -> Option<String> {
    let token = raw.trim();
    let parsed = if token.to_lowercase().starts_with("0x") {
        usize::from_str_radix(token.trim_start_matches("0x").trim_start_matches("0X"), 16).ok()
    } else {
        token.parse::<usize>().ok()
    }?;

    Some(format!("0x{:X}", parsed))
}

fn collect_included_headers(code: &str) -> Vec<String> {
    let mut headers = HashSet::new();

    for line in code.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("#include <") || !trimmed.ends_with('>') {
            continue;
        }

        let header = trimmed
            .trim_start_matches("#include <")
            .trim_end_matches('>')
            .trim();

        if !header.is_empty() {
            headers.insert(header.to_string());
        }
    }

    let mut list = headers.into_iter().collect::<Vec<_>>();
    list.sort();
    list
}

fn collect_i2c_address_uses(code: &str) -> Vec<ParsedCppI2cAddressUse> {
    let mut uses = Vec::new();

    for call in collect_call_captures(code) {
        if call.name == "beginTransmission" {
            if let Some(address) = call
                .arguments
                .get(0)
                .and_then(|argument| normalize_i2c_address_token(&argument.value))
            {
                uses.push(ParsedCppI2cAddressUse {
                    address,
                    line: call.line,
                    source: "Wire.beginTransmission".to_string(),
                    template_hint: None,
                });
            }
            continue;
        }

        if call.name == "begin" {
            let Some(subject) = call.subject.as_deref() else {
                continue;
            };

            let template_hint = if subject.contains("display") || subject.contains("oled") {
                Some("tpl_oled".to_string())
            } else if subject.contains("lcd") {
                Some("tpl_lcd1602".to_string())
            } else {
                None
            };

            if template_hint.is_none() || call.arguments.len() < 2 {
                continue;
            }

            if let Some(address) = call
                .arguments
                .get(1)
                .and_then(|argument| normalize_i2c_address_token(&argument.value))
            {
                uses.push(ParsedCppI2cAddressUse {
                    address,
                    line: call.line,
                    source: format!("{}.begin", subject),
                    template_hint,
                });
            }
        }
    }

    uses
}

fn collect_interrupt_uses(code: &str, board_id: &str) -> Vec<ParsedCppInterruptUse> {
    let aliases = build_cpp_alias_map(code, board_id);
    let mut uses = Vec::new();

    for call in collect_call_captures(code) {
        if call.name != "attachInterrupt" {
            continue;
        }

        let Some(first_arg) = call.arguments.get(0).map(|argument| argument.value.as_str()) else {
            continue;
        };

        let raw_pin = extract_interrupt_pin_token(first_arg).unwrap_or(first_arg);
        let Some(board_pin) = resolve_pin_reference(raw_pin, board_id, &aliases) else {
            continue;
        };

        uses.push(ParsedCppInterruptUse {
            board_pin,
            line: call.line,
        });
    }

    uses
}

fn extract_interrupt_pin_token(raw: &str) -> Option<&str> {
    let trimmed = raw.trim();
    let prefix = "digitalPinToInterrupt(";
    if !trimmed.starts_with(prefix) || !trimmed.ends_with(')') {
        return None;
    }

    let inner = &trimmed[prefix.len()..trimmed.len() - 1];
    let pin = inner.trim();
    if pin.is_empty() {
        None
    } else {
        Some(pin)
    }
}

fn collect_function_scopes(code: &str) -> Vec<(String, usize, usize)> {
    let mut scopes = Vec::new();

    for name in ["setup", "loop"] {
        if let Some(index) = code.find(&format!("void {}(", name)) {
            let line = code[..index].chars().filter(|ch| *ch == '\n').count() + 1;
            let body = &code[index..];
            let span = body.chars().filter(|ch| *ch == '\n').count() + 1;
            scopes.push((name.to_string(), line, line + span));
        }
    }

    scopes
}

fn scope_for_line(line: usize, scopes: &[(String, usize, usize)]) -> String {
    for (name, start, end) in scopes {
        if line >= *start && line <= *end {
            return name.clone();
        }
    }

    "other".to_string()
}

fn build_cpp_alias_map(code: &str, board_id: &str) -> HashMap<String, String> {
    let mut aliases = HashMap::new();

    for line in code.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("#define ") {
            let parts = trimmed.split_whitespace().collect::<Vec<_>>();
            if parts.len() >= 3 {
                if let Some(pin) = normalize_board_pin(board_id, parts[2]) {
                    aliases.insert(parts[1].to_string(), pin);
                }
            }
        } else if trimmed.starts_with("const ") && trimmed.contains('=') {
            let right = trimmed.split('=').nth(1).unwrap_or("").trim().trim_end_matches(';');
            if let Some(pin) = normalize_board_pin(board_id, right) {
                if let Some(name) = trimmed
                    .split('=')
                    .next()
                    .and_then(|left| left.split_whitespace().last())
                {
                    aliases.insert(name.to_string(), pin);
                }
            }
        }
    }

    aliases
}

fn resolve_pin_reference(raw: &str, board_id: &str, aliases: &HashMap<String, String>) -> Option<String> {
    aliases
        .get(raw.trim())
        .cloned()
        .or_else(|| normalize_board_pin(board_id, raw))
}

fn normalize_board_pin(board_id: &str, token: &str) -> Option<String> {
    let cleaned = token.trim().trim_matches('"').trim_matches('\'');
    if cleaned.is_empty() {
        return None;
    }

    let dotted_tail = cleaned.split('.').last().unwrap_or(cleaned);
    let mut candidates = vec![
        cleaned.to_string(),
        cleaned.to_uppercase(),
        dotted_tail.to_string(),
        dotted_tail.to_uppercase(),
    ];

    if dotted_tail.chars().all(|ch| ch.is_ascii_digit()) {
        candidates.push(format!("D{}", dotted_tail));
        candidates.push(format!("GPIO{}", dotted_tail));
        candidates.push(format!("G{}", dotted_tail));
        candidates.push(format!("A{}", dotted_tail));
    }

    for candidate in candidates {
        if board_has_pin(board_id, &candidate) {
            return Some(candidate);
        }
    }

    None
}

fn board_has_pin(board_id: &str, candidate: &str) -> bool {
    match board_id {
        "uno" | "nano" => {
            candidate == "GND"
                || candidate == "5V"
                || candidate == "3.3V"
                || matches!(candidate.strip_prefix('D'), Some(value) if value.parse::<u8>().map(|pin| pin <= 13).unwrap_or(false))
                || matches!(candidate.strip_prefix('A'), Some(value) if value.parse::<u8>().map(|pin| pin <= 7).unwrap_or(false))
        }
        "esp32-devkit" | "esp32" => {
            candidate == "GND"
                || candidate == "5V"
                || candidate == "3.3V"
                || matches!(candidate.strip_prefix("GPIO"), Some(value) if value.parse::<u8>().is_ok())
                || matches!(candidate.strip_prefix('D'), Some(value) if value.parse::<u8>().is_ok())
        }
        "raspberry-pi-4" | "rpi4" => {
            candidate == "GND"
                || candidate == "5V"
                || candidate == "3.3V"
                || matches!(candidate.strip_prefix("GPIO"), Some(value) if value.parse::<u8>().is_ok())
        }
        _ => true,
    }
}

fn strip_python_comments(code: &str) -> String {
    let mut sanitized = String::with_capacity(code.len());
    let mut chars = code.chars().peekable();
    let mut in_single_quote = false;
    let mut in_double_quote = false;

    while let Some(ch) = chars.next() {
        if ch == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            sanitized.push(ch);
            continue;
        }

        if ch == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            sanitized.push(ch);
            continue;
        }

        if ch == '#' && !in_single_quote && !in_double_quote {
            sanitized.push(' ');
            while let Some(next_char) = chars.peek().copied() {
                if next_char == '\n' || next_char == '\r' {
                    break;
                }
                sanitized.push(' ');
                chars.next();
            }
            continue;
        }

        sanitized.push(ch);
    }

    sanitized
}

fn split_python_arguments(raw: &str) -> Vec<String> {
    if raw.trim().is_empty() {
        return vec![];
    }

    let mut args = Vec::new();
    let mut current = String::new();
    let mut depth = 0usize;
    let mut in_single_quote = false;
    let mut in_double_quote = false;

    for ch in raw.chars() {
        if ch == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            current.push(ch);
            continue;
        }

        if ch == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            current.push(ch);
            continue;
        }

        if !in_single_quote && !in_double_quote {
            match ch {
                '(' | '[' | '{' => depth += 1,
                ')' | ']' | '}' => depth = depth.saturating_sub(1),
                ',' if depth == 0 => {
                    let trimmed = current.trim();
                    if !trimmed.is_empty() {
                        args.push(trimmed.to_string());
                    }
                    current.clear();
                    continue;
                }
                _ => {}
            }
        }

        current.push(ch);
    }

    let trimmed = current.trim();
    if !trimmed.is_empty() {
        args.push(trimmed.to_string());
    }

    args
}

fn parse_python_call(line: &str) -> Option<(String, Vec<String>)> {
    let trimmed = line.trim();
    let open_paren = trimmed.find('(')?;
    let close_paren = trimmed.rfind(')')?;
    if close_paren <= open_paren {
        return None;
    }

    let callee = trimmed[..open_paren].trim();
    if callee.is_empty() {
        return None;
    }

    Some((
        callee.to_string(),
        split_python_arguments(&trimmed[(open_paren + 1)..close_paren]),
    ))
}

fn build_python_alias_map(code: &str, board_id: &str) -> HashMap<String, String> {
    let sanitized = strip_python_comments(code);
    let mut aliases = HashMap::new();

    for line in sanitized.lines() {
        let trimmed = line.trim();
        let Some((left, right)) = trimmed.split_once('=') else {
            continue;
        };

        let alias = left.trim();
        if alias.is_empty() {
            continue;
        }

        let Some((callee, args)) = parse_python_call(right.trim()) else {
            continue;
        };

        let Some(first_arg) = args.first() else {
            continue;
        };

        let constructor = callee.rsplit('.').next().unwrap_or(&callee);
        if !matches!(
            constructor,
            "Pin" | "DigitalInOut" | "LED" | "PWMLED" | "Buzzer" | "OutputDevice" | "DigitalOutputDevice" | "Servo"
        ) {
            continue;
        }

        if let Some(pin) = normalize_board_pin(board_id, first_arg) {
            aliases.insert(alias.to_string(), pin);
        }
    }

    aliases
}

fn collect_python_operations(code: &str, board_id: &str) -> Vec<ParsedCppOperation> {
    let sanitized = strip_python_comments(code);
    let aliases = build_python_alias_map(code, board_id);
    let mut operations = Vec::new();

    for (index, line) in sanitized.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let line_number = index + 1;

        if let Some((callee, args)) = parse_python_call(trimmed) {
            if let Some((subject, method)) = callee.rsplit_once('.') {
                if let Some(board_pin) = resolve_pin_reference(subject, board_id, &aliases) {
                    match method {
                        "on" | "off" | "toggle" | "blink" => {
                            operations.push(ParsedCppOperation {
                                op_type: if method == "toggle" || method == "blink" {
                                    "analogWrite".to_string()
                                } else {
                                    "digitalWrite".to_string()
                                },
                                board_pin,
                                mode: None,
                                value: Some(if method == "off" { "LOW" } else { "HIGH" }.to_string()),
                                line: line_number,
                                scope: "other".to_string(),
                            });
                            continue;
                        }
                        "value" => {
                            let op_type = if args.is_empty() {
                                "digitalRead"
                            } else {
                                "digitalWrite"
                            };
                            let value = args.first().map(|raw| {
                                if matches!(raw.as_str(), "0" | "False") {
                                    "LOW".to_string()
                                } else {
                                    "HIGH".to_string()
                                }
                            });

                            operations.push(ParsedCppOperation {
                                op_type: op_type.to_string(),
                                board_pin,
                                mode: None,
                                value,
                                line: line_number,
                                scope: "other".to_string(),
                            });
                            continue;
                        }
                        _ => {}
                    }
                }

                if subject == "Pin" {
                    if let Some(first_arg) = args.first() {
                        if let Some(board_pin) = normalize_board_pin(board_id, first_arg) {
                            if matches!(method, "on" | "off" | "toggle" | "blink") {
                                operations.push(ParsedCppOperation {
                                    op_type: if method == "toggle" || method == "blink" {
                                        "analogWrite".to_string()
                                    } else {
                                        "digitalWrite".to_string()
                                    },
                                    board_pin,
                                    mode: None,
                                    value: Some(if method == "off" { "LOW" } else { "HIGH" }.to_string()),
                                    line: line_number,
                                    scope: "other".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    operations
}

fn parse_python(source: &str, board_id: &str) -> PythonParseTree {
    let sanitized_source = strip_python_comments(source);
    let aliases = build_python_alias_map(source, board_id)
        .into_iter()
        .map(|(name, board_pin)| PythonAlias { name, board_pin })
        .collect::<Vec<_>>();
    let calls = collect_python_call_captures(source);
    let operations = collect_python_operations(source, board_id);

    PythonParseTree {
        backend: "rust-wasm".to_string(),
        source: source.to_string(),
        sanitized_source,
        has_errors: has_obvious_python_syntax_error(source),
        calls,
        operations,
        aliases,
    }
}

fn has_obvious_python_syntax_error(source: &str) -> bool {
    let mut stack = Vec::new();
    let mut in_single = false;
    let mut in_double = false;
    let chars = source.chars().collect::<Vec<_>>();

    for index in 0..chars.len() {
        let current = chars[index];
        let previous = if index > 0 { Some(chars[index - 1]) } else { None };

        if current == '\'' && previous != Some('\\') && !in_double {
            in_single = !in_single;
            continue;
        }

        if current == '"' && previous != Some('\\') && !in_single {
            in_double = !in_double;
            continue;
        }

        if in_single || in_double {
            continue;
        }

        match current {
            '(' | '{' | '[' => stack.push(current),
            ')' => {
                if stack.pop() != Some('(') {
                    return true;
                }
            }
            '}' => {
                if stack.pop() != Some('{') {
                    return true;
                }
            }
            ']' => {
                if stack.pop() != Some('[') {
                    return true;
                }
            }
            _ => {}
        }
    }

    in_single || in_double || !stack.is_empty()
}

fn collect_python_call_captures(code: &str) -> Vec<CppCallCapture> {
    let sanitized = strip_python_comments(code);
    let mut captures = Vec::new();

    for (index, line) in sanitized.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("def ") || trimmed.starts_with("class ") {
            continue;
        }

        let Some((callee, args)) = parse_python_call(trimmed) else {
            continue;
        };

        if callee.contains(char::is_whitespace) || callee.contains('=') {
            continue;
        }

        let (subject, name) = match callee.rsplit_once('.') {
            Some((subject, name)) => (Some(subject.to_string()), name.to_string()),
            None => (None, callee),
        };

        captures.push(CppCallCapture {
            name,
            subject,
            arguments: args
                .into_iter()
                .map(|argument| {
                    let kind = if argument.starts_with('"') || argument.starts_with('\'') {
                        "string"
                    } else if argument.parse::<f64>().is_ok() {
                        "number"
                    } else if argument
                        .chars()
                        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '.')
                    {
                        "identifier"
                    } else {
                        "expression"
                    };

                    CppCallArgument {
                        raw: argument.clone(),
                        kind: kind.to_string(),
                        value: argument,
                    }
                })
                .collect(),
            line: index + 1,
            raw: trimmed.to_string(),
        });
    }

    captures
}
