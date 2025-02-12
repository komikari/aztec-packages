#include "c_bind_new.hpp"
#include "../pedersen_hash/pedersen.hpp"
#include "barretenberg/common/serialize.hpp"
#include "pedersen.hpp"

extern "C" {

using namespace barretenberg;

WASM_EXPORT void pedersen___commit(fr::vec_in_buf inputs_buffer, affine_element::out_buf output)
{
    std::vector<grumpkin::fq> to_commit;
    read(inputs_buffer, to_commit);
    grumpkin::g1::affine_element pedersen_commitment = crypto::pedersen_commitment::commit_native(to_commit);

    serialize::write(output, pedersen_commitment);
}
}