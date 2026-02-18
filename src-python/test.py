import subprocess

def get_gpu_info():
    try:
        result = subprocess.run(
        ['nvidia-smi', '--query-gpu=name,memory.total,memory.used,memory.free', '--format=csv'],
        stdout=subprocess.PIPE, text=True
        )
        print(result.stdout)
    except FileNotFoundError:
        print("NVIDIA驱动未安装或nvidia-smi不可用")

get_gpu_info()

