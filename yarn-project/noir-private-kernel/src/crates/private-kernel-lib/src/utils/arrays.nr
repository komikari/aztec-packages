use crate::abis::new_contract_data::NewContractData;
use dep::std::array;
use crate::utils::bounded_vec::BoundedVec;

// Trait: is_empty
//
// We manually monomorphize the is_empty trait as its a bit simpler 
// and the complexity is localized to this utils package.
//
// The general is_empty trait checks if a data type is is empty,
// and it defines empty for the basic data types as 0.
//
// If a Field is equal to zero, then it is regarded as zero.
// We will go with this definition for now, however it can be problematic 
// if a value can actually be zero. In a future refactor, we can 
// use the optional type for safety. Doing it now would lead to a worse devex
// and would make it harder to sync up with the cpp code.
pub fn is_empty_array<T>(array : [Field; T]) -> bool {
    array.all(|elem| is_empty(elem))
}
pub fn is_empty(value : Field) -> bool {
    value == 0
}
pub fn log_hashes_empty(log_hashes : [Field; 2]) -> bool {
    log_hashes.all(|elem| elem == 0)
}

pub fn array_to_bounded_vec<T, N>(array: [T; N], is_empty_item: fn (T)->bool, empty_item: T) -> BoundedVec<T, N> {
    let mut len = 0;
    for elem in array {
        if !is_empty_item(elem) {
            len += 1;
        }
    }
    
    BoundedVec {
        storage: array,
        len,
        empty_value: empty_item,
    }
}

// Routine which validates that all zero values of an array form a contiguous region at the end, i.e.,
// of the form: [*,*,*...,0,0,0,0] where any * is non-zero. Note that a full array of non-zero values is
// valid.
//
// TODO(David): A bit of a nit, we use is_empty, but we are actually doing is_zero.
// TODO: Concretely, are we validating empty or zero regions?
// 
// TODO: We can possibly optimize this by taking advantage of the fact that adding 0 does not 
// TODO: change a running sum.
pub fn validate_array<T>(array : [Field;T]) {
    let array_length = array.len();

    let mut first_zero_pos = array_length;
    let mut last_non_zero_pos = 0;
    // TODO: using is_empty here is a bit wasteful
    for i in 0..array_length {
        let is_empty = is_empty(array[i]);
        if !is_empty {
            last_non_zero_pos = i;
        } else if is_empty & (first_zero_pos == array_length) {
            first_zero_pos = i;
        }
    }
    assert((last_non_zero_pos as u64) <= (first_zero_pos as u64), "invalid array");
}

// Helper method to determine the number of non-zero/empty elements in
// the array.
pub fn array_length<N>(array : [Field; N]) -> Field {
    let mut length = 0;
    for elem in array {
        if elem != 0 {
            length += 1;
        }
    }
    length
}

#[test]
fn smoke_validate_array() {
    let valid_array = [];
    validate_array(valid_array);

    let valid_array = [0];
    validate_array(valid_array);

    let valid_array = [1,2,3];
    validate_array(valid_array);

    let valid_array = [1,2,3,0];
    validate_array(valid_array);

    let valid_array = [1,2,3,0,0];
    validate_array(valid_array);
}

#[test(should_fail_with = "invalid array")]
fn smoke_validate_array_invalid(){
    let invalid_array = [0,1];
    validate_array(invalid_array);
}

#[test(should_fail_with = "invalid array")]
fn smoke_validate_array_invalid_case2(){
    let invalid_array = [0,0,0,0,1];
    validate_array(invalid_array);
}